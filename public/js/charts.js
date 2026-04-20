// Rolling window size
const WINDOW = 200;

// Chart instances
let accelChart = null;
let jerkChart  = null;

// For jerk computation (derivative of acceleration vector)
let prevAx = null, prevAy = null, prevAz = null, prevTs = null;

const COLORS = {
  ax:   '#58a6ff',
  ay:   '#3fb950',
  az:   '#e3b341',
  amag: '#f85149',
  jerk: '#a371f7',
};

const GRID_COLOR    = '#21262d';
const TICK_COLOR    = '#8b949e';
const LEGEND_COLOR  = '#8b949e';

function dataset(label, color) {
  return {
    label,
    data: [],
    borderColor: color,
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    pointRadius: 0,
    tension: 0.3,
  };
}

function sharedOptions(yLabel) {
  return {
    animation: false,
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        labels: { color: LEGEND_COLOR, font: { size: 11 }, boxWidth: 12, padding: 10 },
      },
      tooltip: {
        backgroundColor: '#1a1f26',
        borderColor: '#30363d',
        borderWidth: 1,
        titleColor: '#e6edf3',
        bodyColor: '#8b949e',
        callbacks: {
          label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(3)}`,
        },
      },
    },
    scales: {
      x: { display: false },
      y: {
        title: { display: !!yLabel, text: yLabel, color: TICK_COLOR, font: { size: 10 } },
        grid:  { color: GRID_COLOR },
        ticks: { color: TICK_COLOR, font: { size: 10 }, maxTicksLimit: 6 },
      },
    },
  };
}

export function initCharts() {
  accelChart = new Chart(document.getElementById('chart-accel'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        dataset('X',   COLORS.ax),
        dataset('Y',   COLORS.ay),
        dataset('Z',   COLORS.az),
        dataset('|a|', COLORS.amag),
      ],
    },
    options: sharedOptions('g'),
  });

  jerkChart = new Chart(document.getElementById('chart-jerk'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [dataset('Jerk', COLORS.jerk)],
    },
    options: sharedOptions('g/s'),
  });
}

export function updateCharts(frame) {
  const ax = frame.ax ?? 0;
  const ay = frame.ay ?? 0;
  const az = frame.az ?? 0;
  const amag = Math.sqrt(ax * ax + ay * ay + az * az);
  const ts   = frame.deviceTs ?? Date.now();

  // Acceleration chart
  appendAndTrim(accelChart, [ax, ay, az, amag]);

  // Jerk = |Δa_vector| / Δt  (only once we have a previous sample)
  if (prevTs !== null) {
    const dt = Math.max((ts - prevTs) / 1000, 0.001);
    const dax = ax - prevAx, day = ay - prevAy, daz = az - prevAz;
    const jerk = Math.sqrt(dax * dax + day * day + daz * daz) / dt;
    appendAndTrim(jerkChart, [jerk]);
  }

  prevAx = ax; prevAy = ay; prevAz = az; prevTs = ts;
}

function appendAndTrim(chart, values) {
  chart.data.labels.push('');
  values.forEach((v, i) => chart.data.datasets[i].data.push(v));

  if (chart.data.labels.length > WINDOW) {
    chart.data.labels.shift();
    chart.data.datasets.forEach((ds) => ds.data.shift());
  }

  chart.update('none'); // skip animation tick
}
