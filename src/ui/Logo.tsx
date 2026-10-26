/** Hand-made pixel-art versions of the logo, sharper than the SVG scaled down. */
const PIXEL_SIZES = [16, 24, 32];

/**
 * The application logo: a compass rose in walnut and gold, "TMM" over it. Large sizes use the SVG
 * (public/logo.svg); 32 px and below use the pixel-art version of that size (or the next one up).
 */
export function Logo({ size, className }: { size: number; className?: string }) {
  const pixel = PIXEL_SIZES.find((s) => s >= size && size <= 32);
  const src = pixel ? `logo-${pixel}.png` : 'logo.svg';
  const classes = ['logo', pixel ? 'pixel' : '', className ?? ''].filter(Boolean).join(' ');
  return (
    <img
      className={classes}
      src={`${import.meta.env.BASE_URL}${src}`}
      alt=""
      width={size}
      height={size}
      draggable={false}
    />
  );
}
