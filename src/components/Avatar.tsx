export function Avatar({ name, size = 48 }: { name: string; size?: number }) {
  return <img className="avatar" src={`avatars/${name}.webp`} width={size} height={size} alt="" />;
}
