import Navbar from "../Component/Common/Navbar";
import Footer from "../Component/Home/Footer";

export default function SiteLayout({ children }) {
  return (
    <>
      <Navbar />
      {children}
      <Footer />
    </>
  );
}
