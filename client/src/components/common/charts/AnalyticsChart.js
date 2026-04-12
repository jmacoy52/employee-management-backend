import React, { useEffect, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const AnalyticsChart = ({ 
  data, 
  title, 
  type = 'line', 
  height = 300, 
  color = '#10b981',
  showGrid = true,
  showLegend = true,
  showTooltip = true 
}) => {
  const chartRef = useRef(null);

  useEffect(() => {
    // Simulate real-time data updates
    const interval = setInterval(() => {
      // Add random data point every 5 seconds
      if (chartRef.current) {
        const newDataPoint = {
          time: new Date().toISOString(),
          value: Math.floor(Math.random() * 100) + 50,
          users: Math.floor(Math.random() * 20) + 10
        };
        
        // Emit real-time update event
        window.dispatchEvent(new CustomEvent('chart-update', { 
          detail: { 
            chart: type, 
            data: newDataPoint 
          } 
        }));
      }
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const renderChart = () => {
    switch (type) {
      case 'line':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <BarChart ref={chartRef} data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="time" 
                stroke="#888" 
                tickFormatter={(value) => new Date(value).toLocaleTimeString()}
              />
              <YAxis stroke="#888" />
              <Tooltip 
                contentStyle={{ backgroundColor: '#fff', border: '1px solid #ccc' }}
                formatter={(value, name) => [
                  `Time: ${new Date(value).toLocaleTimeString()}`,
                  `Value: ${value}`,
                  `Users: ${name === 'users' ? name.users : 'N/A'}`
                ]}
              />
              {showLegend && <Legend />}
            </BarChart>
          </ResponsiveContainer>
        );
      
      case 'area':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <AreaChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" stroke="#888" />
              <YAxis stroke="#888" />
              <Tooltip />
              {showLegend && <Legend />}
            </AreaChart>
          </ResponsiveContainer>
        );
      
      case 'pie':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={(entry) => entry.name}
                outerRadius={80}
                fill={color}
              />
              <Tooltip />
              {showLegend && <Legend />}
            </PieChart>
          </ResponsiveContainer>
        );
      
      default:
        return <div>Chart type not supported</div>;
    }
  };

  return (
    <div className="w-full">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>
      <div className="bg-white p-4 rounded-lg shadow-md">
        {renderChart()}
      </div>
    </div>
  );
};

export default AnalyticsChart;
