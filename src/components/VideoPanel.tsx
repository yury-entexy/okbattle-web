'use client';

import { useEffect, useRef } from 'react';
import { isHost, useGame } from '@/lib/game/store';
import { HOST_VIDEO_UID, newVideoUid, useVideo, type VideoTile } from '@/lib/video';

function Tile({ tile, name }: { tile: VideoTile; name: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const track = tile.track;
    if (!track || !ref.current) return;
    track.play(ref.current, { fit: 'cover', mirror: !!tile.local });
    return () => track.stop();
  }, [tile.track, tile.local]);
  return (
    <div className="vtile" ref={ref}>
      {!tile.track && <span className="vtile-off">камера выключена</span>}
      <small className="vtile-name">{name}</small>
    </div>
  );
}

/** The game's live video, same Agora channel as the app: shown on every screen of a video game. */
export function VideoPanel() {
  const { room, me, setWantsLive, reportOnAir } = useGame();
  const host = useGame(isHost);
  const v = useVideo();
  const id = room?.id;
  const myUid = room?.players[me.id]?.videoUid;
  const onAir = !!room && me.id in room.invited;

  useEffect(() => {
    if (!id) return;
    void useVideo.getState().start(id, host ? HOST_VIDEO_UID : (myUid ?? newVideoUid()), host);
    return () => void useVideo.getState().stop();
    // Join once per game; the uid is fixed when the player joins.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // A player goes on air when the host invites them, and off when the host takes them off.
  useEffect(() => {
    if (host || !v.channel) return;
    if (onAir && !v.live) void v.setLive(true).then((ok) => ok && myUid && reportOnAir(myUid));
    if (!onAir && v.live) void v.setLive(false);
  }, [host, onAir, v, myUid, reportOnAir]);

  if (!room) return null;
  const nameOf = (uid: number) => {
    if (uid === HOST_VIDEO_UID) return 'Ведущий';
    return Object.values(room.players).find((p) => p.videoUid === uid)?.name ?? 'Игрок';
  };
  const wants = room.players[me.id]?.wantsLive;

  return (
    <section className="video" aria-label="Видеотрансляция">
      {v.tiles.length > 0 ? (
        <div className={`vtiles n${Math.min(v.tiles.length, 5)}`}>
          {v.tiles.map((t) => <Tile key={t.uid} tile={t} name={t.local ? 'Вы' : nameOf(t.uid)} />)}
        </div>
      ) : (
        <p className="video-wait">{v.error || 'Ждём видеотрансляцию ведущего…'}</p>
      )}
      <div className="video-controls">
        {v.live && (
          <>
            <button className="chip" aria-pressed={v.cameraOff} onClick={() => void v.toggleCamera()}>
              {v.cameraOff ? 'Включить камеру' : 'Выключить камеру'}
            </button>
            <button className="chip" aria-pressed={v.muted} onClick={() => void v.toggleMic()}>
              {v.muted ? 'Включить микрофон' : 'Выключить микрофон'}
            </button>
          </>
        )}
        <button className="chip" aria-pressed={v.soundOff} onClick={v.toggleSound}>
          {v.soundOff ? 'Звук эфира выкл.' : 'Звук эфира вкл.'}
        </button>
        {!host && room.players[me.id] && (
          <button className="chip" aria-pressed={!!wants} onClick={() => setWantsLive(!wants)}>
            {onAir ? 'Выйти из эфира' : wants ? 'Ждём приглашения ведущего' : 'Хочу в эфир'}
          </button>
        )}
      </div>
    </section>
  );
}
