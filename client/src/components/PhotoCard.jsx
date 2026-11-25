
function PhotoCard({ photo, selected = false, onClick, selectable = false }) {
  return (
    <div
      className={`photo-card ${selected ? "selected" : ""}`}
      onClick={selectable ? onClick : undefined}
      role={selectable ? "button" : undefined}
      tabIndex={selectable ? 0 : undefined}
    >
      <div className="photo-image-wrapper">
        <img
          src={photo.photoUrl}
          alt={`Photo ${photo.photoId}`}
          onError={(event) => {
            event.currentTarget.style.display = "none";
            event.currentTarget.parentElement.classList.add("image-error");
          }}
        />

        <div className="image-fallback">
          <span>📷</span>
          <p>Image unavailable</p>
        </div>

        {selectable && (
          <span className="photo-select-icon">
            {selected ? "✓" : "+"}
          </span>
        )}
      </div>

      <div className="photo-caption">
        <span>Photo {photo.photoId}</span>
        {selected && <span className="check">✓</span>}
      </div>
    </div>
  );
}

export default PhotoCard;
