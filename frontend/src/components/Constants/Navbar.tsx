import { Link } from "react-router-dom";

const Navbar = () => {
  return (
    <nav className="w-full p-4">
      <div className="container mx-auto flex justify-evenly items-center">
        <div className="flex flex-row font-medium">
          <div className="text-white">Chess </div>
          <div className="text-yellow-400">Club</div>
        </div>
        <ul className="flex space-x-6 text-white">
          <li>
            <Link to="/about" className=" hover:text-yellow-400">
              About Us
            </Link>
          </li>
          <li>
            <Link to="/events" className="hover:text-yellow-400">
              Events
            </Link>
          </li>
          <li>
            <Link to="/contact" className="hover:text-yellow-400">
              Contact Us
            </Link>
          </li>
        </ul>
      </div>
    </nav>
  );
};

export default Navbar;
