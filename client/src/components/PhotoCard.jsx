import { API_BASE } from "../api";

function PhotoCard({
  photo,
  selected = false,
  onClick,
  selectable = false,
  actionSlot = null,
}) {
  const imageSrc = photo.previewUrl
    ? photo.previewUrl.startsWith("http")
      ? photo.previewUrl
      : `${API_BASE}${photo.previewUrl}`
    : photo.photoUrl;

  return (
    <div
      className={`photo-card ${selected ? "selected" : ""}`}
      onClick={selectable ? onClick : undefined}
      onKeyDown={
        selectable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      role={selectable ? "button" : undefined}
      tabIndex={selectable ? 0 : undefined}
    >
      <div className="photo-image-wrapper">
        <img
          src={imageSrc}
          alt={photo.title || `Photo ${photo.photoId}`}
          loading="lazy"
          onError={(event) => {
            event.currentTarget.style.display = "none";
            event.currentTarget.parentElement.classList.add("image-error");
          }}
        />

        <div className="image-fallback">
          <span>📷</span>
          <p>Preview unavailable</p>
        </div>

        <span className="photo-price-pill">₹{photo.price || 20}</span>

        {selectable && (
          <span className="photo-select-icon">{selected ? "✓" : "+"}</span>
        )}
      </div>

      <div className="photo-caption">
        <div>
          <span className="photo-title">
            {photo.title || `Photo #${photo.photoId}`}
          </span>
          <small className="photo-sub">Frame #{photo.photoId}</small>
        </div>
        {actionSlot || (selected && <span className="check">✓ Selected</span>)}
      </div>
    </div>
  );
}

export default PhotoCard;
