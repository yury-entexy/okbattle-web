/** A web avatar name (`wolf`), or an image URL from the mobile app. */
export function Avatar({ name, size = 48 }: { name: string; size?: number }) {
  const src = !name ? 'avatars/wolf.webp' : name.includes('/') ? name : `avatars/${name}.webp`;
  return <img className="avatar" src={src} width={size} height={size} alt="" loading="lazy" />;
}
