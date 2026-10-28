'use client';

import { create } from 'zustand';
import type { IAgoraRTCClient, ICameraVideoTrack, IMicrophoneAudioTrack, IRemoteVideoTrack } from 'agora-rtc-sdk-ng';

// The mobile app's Agora project (lib/data/utils/data_consts.dart). Channel = game id; the host
// broadcasts as uid 777, players watch with their member videoUid and go live when invited.
const APP_ID = '4345701a10fb4e6bae4f4d089a5f1118';
export const HOST_VIDEO_UID = 777;

export interface VideoTile {
  uid: number;
  /** Absent while the camera is off. */
  track?: ICameraVideoTrack | IRemoteVideoTrack;
  local?: boolean;
}

interface VideoState {
  channel: string;
  live: boolean;
  tiles: VideoTile[];
  cameraOff: boolean;
  muted: boolean;
  /** Everyone else's sound, for a player sitting next to the host. */
  soundOff: boolean;
  error: string;
  start(channel: string, uid: number, broadcaster: boolean): Promise<void>;
  /** Resolves true once this device is (or stopped being) on air. */
  setLive(on: boolean): Promise<boolean>;
  toggleCamera(): Promise<void>;
  toggleMic(): Promise<void>;
  toggleSound(): void;
  stop(): Promise<void>;
}

let client: IAgoraRTCClient | null = null;
let cam: ICameraVideoTrack | null = null;
let mic: IMicrophoneAudioTrack | null = null;
let uidInCall = 0;
// One role switch at a time: screens re-render while the camera is still starting.
let switching = false;

async function token(channel: string, uid: number, role: 1 | 2): Promise<string | null> {
  const res = await fetch(`api/agora-token?channel=${encodeURIComponent(channel)}&role=${role}&uid=${uid}`);
  if (!res.ok) throw new Error('token');
  return ((await res.json()) as { rtcToken?: string }).rtcToken ?? null;
}

export const useVideo = create<VideoState>((set, get) => {
  const upsert = (tile: VideoTile) =>
    set((s) => ({ tiles: [...s.tiles.filter((t) => t.uid !== tile.uid), tile].sort(byHostFirst) }));
  const drop = (uid: number) => set((s) => ({ tiles: s.tiles.filter((t) => t.uid !== uid) }));

  return {
    channel: '',
    live: false,
    tiles: [],
    cameraOff: false,
    muted: false,
    soundOff: false,
    error: '',

    async start(channel, uid, broadcaster) {
      if (get().channel === channel) return;
      await get().stop();
      set({ channel, error: '', tiles: [] });
      try {
        const { default: AgoraRTC } = await import('agora-rtc-sdk-ng');
        AgoraRTC.setLogLevel(3);
        client = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' });
        client.on('user-published', async (user, kind) => {
          await client!.subscribe(user, kind);
          if (kind === 'video') upsert({ uid: Number(user.uid), track: user.videoTrack });
          if (kind === 'audio' && !get().soundOff) user.audioTrack?.play();
        });
        client.on('user-unpublished', (user, kind) => {
          if (kind === 'video') upsert({ uid: Number(user.uid) });
        });
        client.on('user-left', (user) => drop(Number(user.uid)));
        await client.setClientRole(broadcaster ? 'host' : 'audience', broadcaster ? undefined : { level: 1 });
        await client.join(APP_ID, channel, await token(channel, uid, broadcaster ? 1 : 2), uid);
        uidInCall = uid;
        if (broadcaster) await get().setLive(true);
      } catch {
        set({ error: 'Не удалось подключиться к видеотрансляции.' });
      }
    },

    async setLive(on) {
      if (!client || switching) return false;
      if (get().live === on) return true;
      switching = true;
      const { default: AgoraRTC } = await import('agora-rtc-sdk-ng');
      try {
        if (on) {
          await client.setClientRole('host');
          [mic, cam] = await AgoraRTC.createMicrophoneAndCameraTracks(undefined, { encoderConfig: '360p_7' });
          await client.publish([mic, cam]);
          set({ live: true, cameraOff: false, muted: false });
          upsert({ uid: uidInCall, track: cam, local: true });
        } else {
          if (mic && cam) await client.unpublish([mic, cam]);
          mic?.close();
          cam?.close();
          mic = cam = null;
          await client.setClientRole('audience', { level: 1 });
          set({ live: false });
          drop(uidInCall);
        }
        return true;
      } catch {
        set({ error: on ? 'Нет доступа к камере или микрофону.' : '' });
        return false;
      } finally {
        switching = false;
      }
    },

    async toggleCamera() {
      if (!cam) return;
      const off = !get().cameraOff;
      await cam.setEnabled(!off);
      set({ cameraOff: off });
      upsert({ uid: uidInCall, track: off ? undefined : cam, local: true });
    },
    async toggleMic() {
      if (!mic) return;
      const muted = !get().muted;
      await mic.setMuted(muted);
      set({ muted });
    },
    toggleSound() {
      const soundOff = !get().soundOff;
      client?.remoteUsers.forEach((u) => (soundOff ? u.audioTrack?.stop() : u.audioTrack?.play()));
      set({ soundOff });
    },

    async stop() {
      mic?.close();
      cam?.close();
      mic = cam = null;
      const c = client;
      client = null;
      set({ channel: '', live: false, tiles: [], error: '' });
      await c?.leave().catch(() => {});
    },
  };
});

function byHostFirst(a: VideoTile, b: VideoTile) {
  return (a.uid === HOST_VIDEO_UID ? -1 : 0) - (b.uid === HOST_VIDEO_UID ? -1 : 0) || a.uid - b.uid;
}

/** A random member videoUid, as the app draws it (10 digits, fits Agora's 32-bit uid). */
export const newVideoUid = () => Math.floor(Math.random() * 3294967296) + 1000000000;
