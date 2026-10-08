package com.trackd.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(TrackdBridgePlugin.class);
        super.onCreate(savedInstanceState);
        FirestoreSync.INSTANCE.startCommandListener(this);
        TelemetryDispatcher.INSTANCE.startPeriodic(this);
    }

    @Override
    public void onDestroy() {
        TelemetryDispatcher.INSTANCE.stopPeriodic();
        super.onDestroy();
    }
}
