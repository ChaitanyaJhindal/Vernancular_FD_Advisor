import { Audio } from "expo-av";
import { useCallback, useRef, useState } from "react";

export function useVoiceRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const recordingRef = useRef(null);

  const requestPermission = useCallback(async () => {
    const permission = await Audio.requestPermissionsAsync();
    const granted = permission.status === "granted";
    setPermissionGranted(granted);
    return granted;
  }, []);

  const startRecording = useCallback(async () => {
    const granted = permissionGranted || (await requestPermission());
    if (!granted) {
      throw new Error("Microphone permission denied");
    }

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true
    });

    const recording = new Audio.Recording();
    await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
    await recording.startAsync();

    recordingRef.current = recording;
    setIsRecording(true);
  }, [permissionGranted, requestPermission]);

  const stopRecording = useCallback(async () => {
    const rec = recordingRef.current;
    if (!rec) return null;

    await rec.stopAndUnloadAsync();
    const uri = rec.getURI();
    recordingRef.current = null;
    setIsRecording(false);

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true
    });

    return uri;
  }, []);

  return {
    isRecording,
    requestPermission,
    startRecording,
    stopRecording
  };
}
