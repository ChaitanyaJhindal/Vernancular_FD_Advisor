import fs from 'fs';
// in this import the env variables from .env file to process.env 

import dotenv from 'dotenv';
import record from 'node-record-lpcm16';
import wav from 'wav';
import readline from 'readline';
import { MIC_CONFIG, STT_CONFIG } from './config/app-config.js';
import { getSarvamClient } from './services/sarvam-client.js';
dotenv.config();                                                                            
const TEMP_WAV_PATH = MIC_CONFIG.tempWavPath;

let micInstance = null;
let wavWriter = null;
let recordingDonePromise = null;

function startMicRecording(filePath) {
    if (micInstance) {
        console.log("Recording is already in progress.");
        return;
    }

    wavWriter = new wav.FileWriter(filePath, {
        channels: MIC_CONFIG.channels,
        sampleRate: MIC_CONFIG.sampleRate,
        bitDepth: MIC_CONFIG.bitDepth
    });

    recordingDonePromise = new Promise((resolve, reject) => {
        wavWriter.on('finish', resolve);
        wavWriter.on('error', reject);
    });

    micInstance = record.record({
        sampleRateHertz: MIC_CONFIG.sampleRate,
        channels: MIC_CONFIG.channels,
        threshold: MIC_CONFIG.threshold,
        verbose: MIC_CONFIG.verbose
    });

    micInstance.stream().on('error', (err) => {
        console.error("Mic stream error:", err.message);
    }).pipe(wavWriter);

    console.log("Recording started. Press 2 to stop.");
}

async function stopMicRecording() {
    if (!micInstance) {
        console.log("No active recording. Press 1 to start first.");
        return false;
    }

    micInstance.stop();
    micInstance = null;

    try {
        await recordingDonePromise;
        console.log("Recording stopped.");
        return true;
    } finally {
        wavWriter = null;
        recordingDonePromise = null;
    }
}

async function transcribeAudio(filePath) {
    const client = getSarvamClient();
    if (!client) {
        throw new Error("SARVAM_API_KEY is missing in .env");
    }

    const audioFile = fs.createReadStream(filePath);
    const response = await client.speechToText.transcribe({
        file: audioFile,
        model: STT_CONFIG.defaultModel,
        mode: STT_CONFIG.defaultMode
    });

    console.log("Transcription response:");
    console.log(response);
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log("Type 1 to start recording.");
console.log("Type 2 to stop recording and transcribe.");
console.log("Press Ctrl+C to exit.");
rl.setPrompt("> ");
rl.prompt();

let busy = false;

rl.on('line', async (line) => {
    const cmd = line.trim();

    if (busy) {
        console.log("Please wait for the current action to finish.");
        rl.prompt();
        return;
    }

    try {
        busy = true;

        if (cmd === "1") {
            startMicRecording(TEMP_WAV_PATH);
        } else if (cmd === "2") {
            const hasRecording = await stopMicRecording();
            if (hasRecording) {
                await transcribeAudio(TEMP_WAV_PATH);
            }
        } else {
            console.log("Invalid input. Use 1 to start, 2 to stop.");
        }
    } catch (error) {
        console.error("Error:", error.message);
    } finally {
        busy = false;
        rl.prompt();
    }
});
