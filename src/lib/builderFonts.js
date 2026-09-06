// The website builder lets owners pick from ~21 extra Google families.
// index.html used to load all of them on every page (including inside
// the native app), which is a large stylesheet nobody outside the
// builder needs. Load them once, on demand, from the surfaces that
// render customer sites.
const HREF = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;450;500;550;600;700&family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Space+Grotesk:wght@400;500;600;700&family=Playfair+Display:wght@400;500;600;700&family=Lato:wght@400;700&family=DM+Serif+Display&family=DM+Sans:wght@400;500;700&family=Bodoni+Moda:wght@400;500;700&family=Montserrat:wght@400;500;600;700&family=Cormorant+Garamond:wght@400;500;700&family=Open+Sans:wght@400;500;600;700&family=Archivo+Black&family=Archivo:wght@400;500;700&family=Abril+Fatface&family=IBM+Plex+Mono&family=IBM+Plex+Sans:wght@400;500;700&family=Oswald:wght@400;500;700&family=Lora:ital,wght@0,400;0,500;0,700;1,400&family=Spectral:wght@400;500;700&family=Jost:wght@400;500;600;700&family=Marcellus&family=Nunito:wght@400;600;700&family=Bebas+Neue&display=swap';
let done = false;
export function ensureBuilderFonts() {
  if (done || typeof document === 'undefined') return;
  done = true;
  if (document.querySelector('link[data-builder-fonts]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = HREF; l.setAttribute('data-builder-fonts', '1');
  document.head.appendChild(l);
}
