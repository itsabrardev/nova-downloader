package com.novadownloader.rn

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class NotificationActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val serviceIntent = Intent(context, MusicService::class.java).apply {
            action = intent.action
        }
        context.startService(serviceIntent)
    }
}
