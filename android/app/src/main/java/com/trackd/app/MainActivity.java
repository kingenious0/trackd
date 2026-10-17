package com.trackd.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(TrackdBridgePlugin.class);
        super.onCreate(savedInstanceState);
        AnalyticsHelper.INSTANCE.init(this);
        TrackdSentinelService.Companion.start(this);
        FirestoreSync.INSTANCE.startCommandListener(this);
        FirestoreSync.INSTANCE.ensureFcmToken(this);
        TelemetryDispatcher.INSTANCE.startPeriodic(this);
    }

    @Override
    public void onDestroy() {
        // Keep TrackdSentinelService running 24/7 in background for remote commands
        super.onDestroy();
    }
}
