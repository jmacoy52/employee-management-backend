// Simple API test component to debug connection issues
import React, { useState, useEffect } from 'react';
import axios from 'axios';

const ApiTest = () => {
  const [testResults, setTestResults] = useState({});
  const [loading, setLoading] = useState(false);

  const testAPIConnection = async () => {
    setLoading(true);
    const results = {};
    
    try {
      // Test 1: Check if token exists
      const token = localStorage.getItem("token");
      results.token = token ? "Token exists" : "No token found";
      
      if (token) {
        // Test 2: Test stats endpoint
        try {
          const statsResponse = await axios.get("http://localhost:5000/api/users/stats", {
            headers: { Authorization: `Bearer ${token}` }
          });
          results.stats = "✅ Stats endpoint working";
          results.statsData = statsResponse.data;
        } catch (err) {
          results.stats = `❌ Stats endpoint failed: ${err.message}`;
          results.statsError = err.response?.data || err.message;
        }

        // Test 3: Test users endpoint
        try {
          const usersResponse = await axios.get("http://localhost:5000/api/users/all", {
            headers: { Authorization: `Bearer ${token}` }
          });
          results.users = "✅ Users endpoint working";
          results.usersCount = usersResponse.data?.length || 0;
        } catch (err) {
          results.users = `❌ Users endpoint failed: ${err.message}`;
          results.usersError = err.response?.data || err.message;
        }

        // Test 4: Test audit logs endpoint
        try {
          const auditResponse = await axios.get("http://localhost:5000/api/admin/audit-logs", {
            headers: { Authorization: `Bearer ${token}` }
          });
          results.audit = "✅ Audit logs endpoint working";
          results.auditCount = auditResponse.data?.length || 0;
        } catch (err) {
          results.audit = `❌ Audit logs endpoint failed: ${err.message}`;
          results.auditError = err.response?.data || err.message;
        }
      }
    } catch (err) {
      results.general = `❌ General error: ${err.message}`;
    }
    
    setTestResults(results);
    setLoading(false);
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace' }}>
      <h2>API Connection Test</h2>
      <button 
        onClick={testAPIConnection} 
        disabled={loading}
        style={{
          padding: '10px 20px',
          background: loading ? '#ccc' : '#10b981',
          color: 'white',
          border: 'none',
          borderRadius: '5px',
          cursor: loading ? 'not-allowed' : 'pointer',
          marginBottom: '20px'
        }}
      >
        {loading ? 'Testing...' : 'Test API Connection'}
      </button>
      
      <div style={{ background: '#f5f5f5', padding: '15px', borderRadius: '5px' }}>
        <h3>Test Results:</h3>
        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {JSON.stringify(testResults, null, 2)}
        </pre>
      </div>
    </div>
  );
};

export default ApiTest;
