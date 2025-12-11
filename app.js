// Minimal app.js — recherche + affichage + notifications
const CONFIG = {
  GEOCODING_API: 'https://geocoding-api.open-meteo.com/v1/search',
  WEATHER_API: 'https://api.open-meteo.com/v1/forecast',
  RAIN_CODES: [51,53,55,56,57,61,63,65,66,67,71,73,75,77,80,81,82,85,86,95,96,99],
  TEMP_THRESHOLD: 10
};

// DOM
const el = {
  cityInput: null,
  searchBtn: null,
  loading: null,
  error: null,
  weatherSection: null,
  cityName: null,
  temperature: null,
  weatherIcon: null,
  wind: null,
  humidity: null,
  feelsLike: null,
  hourlyList: null
};

function initElements(){
  el.cityInput = document.getElementById('city-input');
  el.searchBtn = document.getElementById('search-btn');
  el.loading = document.getElementById('loading');
  el.error = document.getElementById('error-message');
  el.weatherSection = document.getElementById('weather-section');
  el.cityName = document.getElementById('city-name');
  el.temperature = document.getElementById('temperature');
  el.weatherIcon = document.getElementById('weather-icon');
  el.wind = document.getElementById('wind');
  el.humidity = document.getElementById('humidity');
  el.feelsLike = document.getElementById('feels-like');
  el.hourlyList = document.getElementById('hourly-list');
}

function showLoading(){ if(el.loading) el.loading.classList.remove('hidden'); if(el.weatherSection) el.weatherSection.classList.add('hidden'); }
function hideLoading(){ if(el.loading) el.loading.classList.add('hidden'); }
function showError(msg){ if(el.error){ el.error.textContent = msg; el.error.classList.remove('hidden'); } }
function hideError(){ if(el.error) el.error.classList.add('hidden'); }

async function handleSearch(){
  hideError();
  const q = (el.cityInput && el.cityInput.value || '').trim();
  if (!q) { showError('Veuillez entrer une ville'); return; }
  showLoading();

  try{
    // Géocodage
    const gresp = await fetch(`${CONFIG.GEOCODING_API}?name=${encodeURIComponent(q)}&count=1&language=fr`);
    if(!gresp.ok) throw new Error('Erreur de géocodage');
    const gjson = await gresp.json();
    if(!gjson.results || gjson.results.length===0) throw new Error('Ville non trouvée');
    const loc = gjson.results[0];
    const cityLabel = `${loc.name}${loc.admin1? ', '+loc.admin1: ''}, ${loc.country}`;

    // Météo
    const url = `${CONFIG.WEATHER_API}?latitude=${loc.latitude}&longitude=${loc.longitude}`+
      `&current_weather=true&hourly=temperature_2m,weathercode&timezone=auto&forecast_days=1`;
    const wresp = await fetch(url);
    if(!wresp.ok) throw new Error('Erreur récupération météo');
    const wjson = await wresp.json();

    displayWeather(wjson, cityLabel);
    checkAndNotify(wjson, cityLabel);
  }catch(err){
    showError(err.message || 'Erreur');
  }finally{ hideLoading(); }
}

function displayWeather(data, cityLabel){
  const current = data.current_weather || {};
  const hourly = data.hourly || {};

  if(el.cityName) el.cityName.textContent = cityLabel;
  if(el.temperature) el.temperature.textContent = current.temperature !== undefined ? Math.round(current.temperature)+'°C' : '-';
  if(el.weatherIcon) el.weatherIcon.textContent = current.weathercode !== undefined ? getEmoji(current.weathercode) : '';
  if(el.wind) el.wind.textContent = current.windspeed !== undefined ? Math.round(current.windspeed)+' km/h' : '';
  if(el.humidity) el.humidity.textContent = '';
  if(el.feelsLike) el.feelsLike.textContent = '';

  // Prévisions: prendre les entrées horaires dont timestamp est dans (now, now+4h]
  const times = hourly.time || [];
  const temps = hourly.temperature_2m || [];
  const codes = hourly.weathercode || [];
  const now = Date.now();
  const windowEnd = now + 4*60*60*1000;
  const items = [];

  for(let i=0;i<times.length;i++){
    const t = new Date(times[i]).getTime();
    if(t>now && t<=windowEnd){
      const temp = temps[i];
      const code = codes[i];
      const rain = CONFIG.RAIN_CODES.includes(code);
      const high = temp>CONFIG.TEMP_THRESHOLD;
      const cls = rain ? 'rain-alert' : (high ? 'temp-alert' : '');
      const hour = new Date(times[i]).getHours();
      items.push(`<div class="hourly-item ${cls}"><div class="hourly-time">${hour}h</div><div class="hourly-icon">${getEmoji(code)}</div><div class="hourly-temp">${Math.round(temp)}°C</div></div>`);
    }
  }

  if(el.hourlyList) el.hourlyList.innerHTML = items.join('') || '<div class="hourly-item">Aucune donnée prochaine</div>';
  if(el.weatherSection) el.weatherSection.classList.remove('hidden');
}

async function checkAndNotify(data, cityLabel){
  const hourly = data.hourly || {};
  const times = hourly.time || [];
  const temps = hourly.temperature_2m || [];
  const codes = hourly.weathercode || [];

  const now = Date.now();
  const windowEnd = now + 4*60*60*1000;
  let rainAt = null;
  let highAt = null;
  let highTemp = null;

  for(let i=0;i<times.length;i++){
    const t = new Date(times[i]).getTime();
    if(t>now && t<=windowEnd){
      const code = codes[i];
      const temp = temps[i];
      if(rainAt===null && CONFIG.RAIN_CODES.includes(code)) rainAt = new Date(times[i]);
      if(highAt===null && temp>CONFIG.TEMP_THRESHOLD){ highAt = new Date(times[i]); highTemp = Math.round(temp); }
    }
  }

  if(!rainAt && !highAt) return; // rien à notifier
  if(!('Notification' in window)) return;

  if(Notification.permission === 'granted'){
    if(rainAt) notify(cityLabel, `🌧️ Pluie prévue autour de ${rainAt.getHours()}h`);
    if(highAt) notify(cityLabel, `🌡️ Température > ${CONFIG.TEMP_THRESHOLD}°C (${highTemp}°C)`);
  }else if(Notification.permission !== 'denied'){
    try{
      const p = await Notification.requestPermission();
      if(p==='granted'){
        if(rainAt) notify(cityLabel, `🌧️ Pluie prévue autour de ${rainAt.getHours()}h`);
        if(highAt) notify(cityLabel, `🌡️ Température > ${CONFIG.TEMP_THRESHOLD}°C (${highTemp}°C)`);
      }
    }catch(e){ console.warn('Permission notification erreur', e); }
  }
}

function notify(title, body){
  try{ new Notification(title, { body, icon: 'icons/icon-192.png' }); }
  catch(e){ console.warn('Notification failed', e); }
}

function getEmoji(code){
  const map = {0:'☀️',1:'🌤️',2:'⛅',3:'☁️',45:'🌫️',48:'🌫️',51:'🌦️',53:'🌦️',55:'🌧️',56:'🌨️',57:'🌨️',61:'🌧️',63:'🌧️',65:'🌧️',66:'🌨️',67:'🌨️',71:'🌨️',73:'🌨️',75:'❄️',77:'🌨️',80:'🌦️',81:'🌧️',82:'⛈️',85:'🌨️',86:'❄️',95:'⛈️',96:'⛈️',99:'⛈️'};
  return map[code]||'🌤️';
}

// Setup
if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', ()=>{ initElements(); if(el.searchBtn) el.searchBtn.addEventListener('click', handleSearch); if(el.cityInput) el.cityInput.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); handleSearch(); } }); });
}else{
  initElements(); if(el.searchBtn) el.searchBtn.addEventListener('click', handleSearch); if(el.cityInput) el.cityInput.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); handleSearch(); } });
}
