"""HTTP client for site private JSON APIs (stdlib-only).

Purpose-built to talk to browser-fronted JSON endpoints that reject
naive requests. Two failure modes are handled *by construction*:

* **HTTP 405 Method Not Allowed** — API endpoints (detail / episode
  lookups) almost always require ``POST`` with a JSON body, not
  ``GET``. This client sends the method the endpoint actually expects
  and always attaches browser-like headers (``Referer``, ``Origin``,
  ``Accept``, ``Content-Type``), which is what silences the 405.
* **HTTP 429 Too Many Requests** — retried with exponential backoff,
  honouring ``Retry-After`` when the CDN provides it.

Ranged media downloads (HTTP 206 Partial Content) are supported via
:meth:`SiteClient.open_range` for resumable transfers.

Stdlib ``urllib`` only — no new runtime dependency, PyInstaller-safe.
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urljoin, urlparse

# A current, real desktop Chrome UA. Many CDNs 403/429 unknown agents.
_DEFAULT_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36"
)


class SiteClientError(Exception):
    """HTTP failure with the status code and (truncated) response body."""

    def __init__(self, message: str, *, status: int | None = None, body: str = "") -> None:
        super().__init__(message)
        self.status = status
        self.body = body[:500]


@dataclass(frozen=True)
class SiteConfig:
    """Everything site-specific lives here — nothing hard-coded below.

    ``base_url`` is the site the API belongs to (used for ``Referer``
    and ``Origin``). ``api_base`` is where the JSON endpoints live when
    they sit on a different host/CDN; defaults to ``base_url``.
    """

    base_url: str
    api_base: str = ""
    user_agent: str = _DEFAULT_UA
    extra_headers: dict[str, str] = field(default_factory=dict)
    max_retries: int = 4
    backoff_base: float = 1.5  # seconds; doubled each retry
    timeout: float = 30.0

    def resolved_api_base(self) -> str:
        return self.api_base or self.base_url


class SiteClient:
    """Browser-emulating JSON/media client for one site."""

    def __init__(self, config: SiteConfig) -> None:
        self._cfg = config
        origin = self._origin(config.base_url)
        # Headers a real browser XHR/fetch would send. The Referer/Origin
        # pair is what most 405/403 gates actually check.
        self._base_headers = {
            "User-Agent": config.user_agent,
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "en-US,en;q=0.9",
            "Origin": origin,
            "Referer": config.base_url if config.base_url.endswith("/") else config.base_url + "/",
            "Connection": "keep-alive",
            **config.extra_headers,
        }

    @staticmethod
    def _origin(url: str) -> str:
        parts = urlparse(url)
        return f"{parts.scheme}://{parts.netloc}" if parts.scheme else url

    # -- JSON API ------------------------------------------------------
    def get_json(self, path: str, *, params: dict[str, Any] | None = None) -> Any:
        """GET a JSON endpoint (use only when the API expects GET)."""
        from urllib.parse import urlencode

        url = urljoin(self._cfg.resolved_api_base(), path)
        if params:
            url = f"{url}?{urlencode(params)}"
        return self._request_json(url, method="GET")

    def post_json(self, path: str, payload: dict[str, Any] | None = None) -> Any:
        """POST a JSON body — the fix for '405 Method Not Allowed'.

        Detail/season/episode endpoints reject GET; they want a POST
        carrying the id/resource in a JSON body. This sends exactly that
        with ``Content-Type: application/json``.
        """
        url = urljoin(self._cfg.resolved_api_base(), path)
        body = json.dumps(payload or {}).encode("utf-8")
        return self._request_json(url, method="POST", body=body, content_type="application/json")

    # -- media ---------------------------------------------------------
    def open_range(self, url: str, start: int = 0, end: int | None = None):
        """Open a media stream with a ``Range`` header (expects 206/200).

        Returns the live ``http.client.HTTPResponse`` for streaming to
        disk. Caller is responsible for closing it.
        """
        rng = f"bytes={start}-" if end is None else f"bytes={start}-{end}"
        headers = {**self._base_headers, "Range": rng, "Accept": "*/*"}
        req = urllib.request.Request(url, headers=headers, method="GET")
        return urllib.request.urlopen(req, timeout=self._cfg.timeout)

    # -- internals -----------------------------------------------------
    def _request_json(
        self,
        url: str,
        *,
        method: str,
        body: bytes | None = None,
        content_type: str | None = None,
    ) -> Any:
        headers = dict(self._base_headers)
        if content_type:
            headers["Content-Type"] = content_type
        raw = self._request_with_retry(url, method=method, body=body, headers=headers)
        try:
            return json.loads(raw.decode("utf-8"))
        except (ValueError, UnicodeDecodeError) as exc:
            raise SiteClientError(
                f"{method} {url} returned non-JSON response", body=raw[:500].decode("latin-1", "replace")
            ) from exc

    def _request_with_retry(
        self, url: str, *, method: str, body: bytes | None, headers: dict[str, str]
    ) -> bytes:
        last_exc: Exception | None = None
        for attempt in range(self._cfg.max_retries + 1):
            req = urllib.request.Request(url, data=body, headers=headers, method=method)
            try:
                with urllib.request.urlopen(req, timeout=self._cfg.timeout) as resp:
                    return resp.read()
            except urllib.error.HTTPError as exc:
                detail = exc.read()[:500].decode("latin-1", "replace") if exc.fp else ""
                if exc.code == 429 and attempt < self._cfg.max_retries:
                    time.sleep(self._retry_after(exc, attempt))
                    last_exc = exc
                    continue
                if exc.code == 405:
                    raise SiteClientError(
                        f"405 Method Not Allowed for {method} {url}. The endpoint likely "
                        f"expects a different method (try POST with a JSON body).",
                        status=405,
                        body=detail,
                    ) from exc
                raise SiteClientError(
                    f"HTTP {exc.code} for {method} {url}", status=exc.code, body=detail
                ) from exc
            except urllib.error.URLError as exc:
                if attempt < self._cfg.max_retries:
                    time.sleep(self._cfg.backoff_base * (2**attempt))
                    last_exc = exc
                    continue
                raise SiteClientError(f"Network error for {method} {url}: {exc.reason}") from exc
        raise SiteClientError(f"Exhausted retries for {method} {url}") from last_exc

    def _retry_after(self, exc: urllib.error.HTTPError, attempt: int) -> float:
        header = exc.headers.get("Retry-After") if exc.headers else None
        if header and header.isdigit():
            return float(header)
        return self._cfg.backoff_base * (2**attempt)

