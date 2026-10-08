package com.trackd.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        FirestoreSync.INSTANCE.startCommandListener(this);
    }

    @Override
    protected void load() {
        registerPlugin(TrackdBridgePlugin.class);
        super.load();
    }
}
