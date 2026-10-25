import "./status-bar.css";

/** A real viewport-wide fixed element for WebKit's status-bar edge sampling. */
export default function StatusBarSurface() {
  return <div className="sweatbox-status-bar-surface" aria-hidden="true"/>;
}
