import { useContext, useState } from "react";
import { Link } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import Button from "../Button/Button";
// import "./header.scss"
import style from "./header.module.scss"
import cn from "classnames"


const Header = () => {
  const { isUserLogged } = useContext(AuthContext);
  const { userInfo, handleLogOut } = useContext(AuthContext);
  const [isActive, setIsActive] = useState(false);
  const [isOpen, setIsOpen] = useState(false)

  const toggleMenu = () => {
    setIsActive((prev) => !prev);
    setIsOpen((prev) => !prev);
  };

  return (
    <header className={style.header}>

      <div className={style.logo}>
        <span>ST</span>
      </div>

      <nav className={cn(style.nav, { [style.open]: isOpen })}>
        <ul>
          {!isUserLogged ? (
            <>
              <li><Link to="sign-in" className="">Вхід</Link></li>
              <li><Link to="sign-up" className="">Реєстрація</Link></li>
            </>
          ) : (
            <li >
              <a href="" onClick={handleLogOut}>Вихід</a>
              {/* <Button onClick={handleLogOut}>Log Out</Button> */}
            </li>
          )}
        </ul>
      </nav>

      <div className={cn(style.burger, { [style.active]: isActive })} onClick={toggleMenu}>
        <span></span>
      </div>

    </header>
  )
};

export default Header;
