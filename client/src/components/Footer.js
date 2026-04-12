import React from "react";
import { Link } from "react-router-dom";
import "./Footer.css";

const Footer = () => {
  return (
    <footer className="footer">
      <p>&copy; {new Date().getFullYear()} EmploCore. All rights reserved.</p>
      <div className="footer-links">
        <Link to="/privacy">Privacy Policy</Link>
        <Link to="/terms">Terms</Link>
        <Link to="/contact">Contact</Link>
      </div>
    </footer>
  );
};

export default Footer;
