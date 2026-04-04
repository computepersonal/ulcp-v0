import { NavLink } from 'react-router-dom';

interface BottomNavProps {
  homeLink?: string;
  menuLink?: string;
  showMenu?: boolean;
}

export default function BottomNav({ homeLink = '/', menuLink, showMenu = false }: BottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 h-14 bg-white border-t border-gray-200 flex items-center justify-around z-30">
      <NavLink
        to={homeLink}
        className={({ isActive }) =>
          `flex flex-col items-center gap-0.5 px-6 py-1 text-xs font-medium ${isActive ? 'text-brand-500' : 'text-gray-500'}`
        }
      >
        <span className="text-lg">🏠</span>
        Home
      </NavLink>
      {showMenu && menuLink && (
        <NavLink
          to={menuLink}
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 px-6 py-1 text-xs font-medium ${isActive ? 'text-brand-500' : 'text-gray-500'}`
          }
        >
          <span className="text-lg">📋</span>
          Menu
        </NavLink>
      )}
      {!showMenu && (
        <NavLink
          to="/explore"
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 px-6 py-1 text-xs font-medium ${isActive ? 'text-brand-500' : 'text-gray-500'}`
          }
        >
          <span className="text-lg">🔍</span>
          Explore
        </NavLink>
      )}
    </nav>
  );
}
