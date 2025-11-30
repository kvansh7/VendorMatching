import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import VendorSubmission from "./pages/VendorSubmission";
import VendorMatching from "./pages/VendorMatching";
import PsSubmission from "./pages/PsSubmission";
import MainLayout from "./layout/MainLayout";
import Vendors from "./pages/Vendors";
import VendorSearch from "./pages/VendorSearch";
import Viewps from "./pages/ViewProblemStatements";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import { LLMProvider } from "./context/LLMProviderContext";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";

function App() {
  return (
    <AuthProvider>
      <LLMProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          
          <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
            <Route path="/" element={<Home />} />
            <Route path="/ps-submission" element={<PsSubmission />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/vendor-submission" element={<VendorSubmission />} />
            <Route path="/vendor-matching" element={<VendorMatching />} />
            <Route path="/vendors" element={<Vendors />} />
            <Route path="/viewps" element={<Viewps />} />
            <Route path="/vendorsearch" element={<VendorSearch />} />
          </Route>
        </Routes>
      </LLMProvider>
    </AuthProvider>
  );
}

export default App;
