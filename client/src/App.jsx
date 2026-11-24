
import { useEffect, useState } from "react";
import "./App.css";

function App() {
  const [backendMessage, setBackendMessage] = useState("Connecting...");
  
  useEffect(() => {
    fetch("http://localhost:5000/api/health")
      .then((response) => response.json())
      .then((data) => {
        setBackendMessage(data.message);
      })
      .catch(() => {
        setBackendMessage("Backend connection failed");
      });
  }, []);

  return (
    <div>
      <h1>Celebrare</h1>
      <p>Direct UPI Payments for Event Photos</p>
      
      <h2>Backend Status:</h2>
      <p>{backendMessage}</p>
    </div>
  );
}

export default App;
