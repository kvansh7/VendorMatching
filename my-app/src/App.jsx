import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import VendorSubmission from "./pages/VendorSubmission";
import VendorMatching from "./pages/VendorMatching";
import PsSubmission from "./pages/PsSubmission";
import MainLayout from "./layout/MainLayout";
import Vendors from "./pages/Vendors";
import { LLMProvider } from "./context/LLMProviderContext"; // 👈 add this import
import VendorSearch from "./pages/VendorSearch";

function App() {
  return (
    <LLMProvider> 
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/ps-submission" element={<PsSubmission />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/vendor-submission" element={<VendorSubmission />} />
          <Route path="/vendor-matching" element={<VendorMatching />} />
          <Route path="/vendors" element={<Vendors />} />
          <Route path="/vendorsearch" element={<VendorSearch/>}/>
        </Route>
      </Routes>
    </LLMProvider>
  );
}

export default App;