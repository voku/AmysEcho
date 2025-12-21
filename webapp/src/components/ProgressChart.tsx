/**
 * ProgressChart - Detailed progress visualization for a specific gesture
 * Mirrors app/src/screens/ProgressChartScreen.tsx
 * 
 * For Amy: Shows growth over time, celebrating every improvement
 */
import React from 'react';
import { useSearchParams, Link } from 'react-router-dom';

interface DataPoint {
  date: string;
  successRate: number;
  attempts: number;
}

export const ProgressChart: React.FC = () => {
  const [searchParams] = useSearchParams();
  const gestureId = searchParams.get('gesture') || 'unknown';
  const [data, setData] = React.useState<DataPoint[]>([]);

  React.useEffect(() => {
    // Load historical data
    const savedHistory = localStorage.getItem(`amysecho_history_${gestureId}`);
    if (savedHistory) {
      try {
        setData(JSON.parse(savedHistory));
      } catch {
        // Use sample data
        generateSampleData();
      }
    } else {
      generateSampleData();
    }
  }, [gestureId]);

  const generateSampleData = () => {
    // Generate sample historical data for demonstration
    const sampleData: DataPoint[] = [];
    const today = new Date();
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      
      // Simulate improving success rate over time
      const baseRate = 0.5 + (6 - i) * 0.05 + Math.random() * 0.15;
      sampleData.push({
        date: date.toISOString(),
        successRate: Math.min(0.95, Math.max(0.3, baseRate)),
        attempts: Math.floor(Math.random() * 10) + 5
      });
    }
    
    setData(sampleData);
  };

  // Chart dimensions
  const width = 600;
  const height = 300;
  const padding = 50;
  const chartWidth = width - 2 * padding;
  const chartHeight = height - 2 * padding;

  // Calculate scales
  const xScale = (index: number) => {
    if (data.length <= 1) return padding + chartWidth / 2;
    return padding + (chartWidth / (data.length - 1)) * index;
  };
  
  const yScale = (value: number) => {
    return height - padding - chartHeight * value;
  };

  // Generate path for line chart
  const linePath = data.length > 1
    ? data.map((d, i) => {
        const x = xScale(i);
        const y = yScale(d.successRate);
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
      }).join(' ')
    : '';

  // Format date for display
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('de-DE', { month: 'short', day: 'numeric' });
  };

  // Calculate trend
  const getTrend = () => {
    if (data.length < 2) return { direction: 'stable', change: 0 };
    const first = data[0]?.successRate || 0;
    const last = data[data.length - 1]?.successRate || 0;
    const change = Math.round((last - first) * 100);
    
    if (change > 5) return { direction: 'up', change };
    if (change < -5) return { direction: 'down', change };
    return { direction: 'stable', change };
  };

  const trend = getTrend();
  const latestRate = data.length > 0 ? data[data.length - 1]?.successRate || 0 : 0;
  const totalAttempts = data.reduce((sum, d) => sum + d.attempts, 0);

  return (
    <div className="progress-chart">
      <h2>📈 Fortschritt: {gestureId.charAt(0).toUpperCase() + gestureId.slice(1)}</h2>

      {/* Summary Stats */}
      <div className="chart-summary">
        <div className="stat-card">
          <span className="stat-value">{Math.round(latestRate * 100)}%</span>
          <span className="stat-label">Aktuelle Rate</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{totalAttempts}</span>
          <span className="stat-label">Versuche (7 Tage)</span>
        </div>
        <div className="stat-card">
          <span className={`stat-value trend-${trend.direction}`}>
            {trend.direction === 'up' ? '↗️' : trend.direction === 'down' ? '↘️' : '➡️'}
            {Math.abs(trend.change)}%
          </span>
          <span className="stat-label">Trend</span>
        </div>
      </div>

      {/* SVG Chart */}
      <div className="chart-container">
        <svg viewBox={`0 0 ${width} ${height}`} className="line-chart">
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((val) => (
            <React.Fragment key={val}>
              <line
                x1={padding}
                y1={yScale(val)}
                x2={width - padding}
                y2={yScale(val)}
                stroke="#e2e8f0"
                strokeDasharray={val === 0 ? "0" : "4,4"}
              />
              <text
                x={padding - 10}
                y={yScale(val) + 4}
                textAnchor="end"
                fill="#64748b"
                fontSize="12"
              >
                {Math.round(val * 100)}%
              </text>
            </React.Fragment>
          ))}

          {/* Axes */}
          <line
            x1={padding}
            y1={height - padding}
            x2={width - padding}
            y2={height - padding}
            stroke="#94a3b8"
            strokeWidth="2"
          />
          <line
            x1={padding}
            y1={padding}
            x2={padding}
            y2={height - padding}
            stroke="#94a3b8"
            strokeWidth="2"
          />

          {/* Data line */}
          {linePath && (
            <path
              d={linePath}
              fill="none"
              stroke="#0ea5e9"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Data points */}
          {data.map((d, i) => (
            <g key={i}>
              <circle
                cx={xScale(i)}
                cy={yScale(d.successRate)}
                r="6"
                fill="#0ea5e9"
                stroke="white"
                strokeWidth="2"
              />
              <text
                x={xScale(i)}
                y={height - padding + 20}
                textAnchor="middle"
                fill="#64748b"
                fontSize="11"
              >
                {formatDate(d.date)}
              </text>
            </g>
          ))}
        </svg>
      </div>

      {/* Insights */}
      <section className="chart-insights">
        <h3>💡 Erkenntnisse</h3>
        <ul>
          {trend.direction === 'up' && (
            <li className="insight positive">
              <span>🌟</span> Großartiger Fortschritt! Die Erkennungsrate ist um {trend.change}% gestiegen.
            </li>
          )}
          {trend.direction === 'down' && (
            <li className="insight">
              <span>💪</span> Die Rate ist etwas gesunken. Gemeinsames Üben kann helfen!
            </li>
          )}
          {latestRate >= 0.8 && (
            <li className="insight positive">
              <span>⭐</span> Diese Gebärde wird sehr zuverlässig erkannt!
            </li>
          )}
          {latestRate < 0.6 && (
            <li className="insight">
              <span>🎯</span> Mehr Trainingsbeispiele könnten die Erkennung verbessern.
            </li>
          )}
          <li className="insight">
            <span>📊</span> Regelmäßiges Üben führt zu den besten Ergebnissen.
          </li>
        </ul>
      </section>

      <div className="chart-actions">
        <Link to={`/lernen?gesture=${gestureId}`} className="primary-button">
          Gebärde üben
        </Link>
        <Link to="/bericht" className="secondary-button">
          Zum Gesamtbericht
        </Link>
        <Link to="/fortschritt" className="secondary-button">
          Zurück
        </Link>
      </div>
    </div>
  );
};
