
function Navbar({ activeTab, onChangeTab }) {
  const menuItems = [
    { id: "dashboard", icon: "⌂", label: "Dashboard" },
    { id: "manage", icon: "▧", label: "Manage Photos" },
    { id: "gallery", icon: "▣", label: "Guest Gallery" },
  ];

  return (
    <aside className="sidebar">
      <h2 className="logo">
        Celebrare<span>.</span>
      </h2>

      <p className="menu-title">WORKSPACE</p>

      <nav className="sidebar-menu">
        {menuItems.map((item) => (
          <button
            key={item.id}
            className={
              activeTab === item.id ? "nav-item active" : "nav-item"
            }
            onClick={() => onChangeTab(item.id)}
          >
            <span className="nav-icon">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      <div className="sidebar-bottom">
        <div className="profile">
          <div className="avatar">P</div>
          <div>
            <strong>Photographer</strong>
            <small>Demo Account</small>
          </div>
        </div>
      </div>
    </aside>
  );
}

export default Navbar;
