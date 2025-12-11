// Configuration minimale
const CONFIG = {
    GEOCODING_API: 'https://geocoding-api.open-meteo.com/v1/search',
    WEATHER_API: 'https://api.open-meteo.com/v1/forecast',
    RAIN_CODES: [51,53,55,56,57,61,63,65,66,67,71,73,75,77,80,81,82,85,86,95,96,99],
    TEMP_THRESHOLD: 10
};

// Éléments DOM
const elements = {
    cityInput: document.getElementById('city-input'),
    searchBtn: document.getElementById('search-btn'),
    weatherSection: document.getElementById('weather-section'),
    cityName: document.getElementById('city-name'),
    temperature: document.getElementById('temperature'),
    weatherIcon: document.getElementById('weather-icon'),
    wind: document.getElementById('wind'),
    humidity: document.getElementById('humidity'),
    feelsLike: document.getElementById('feels-like'),
    hourlyList: document.getElementById('hourly-list'),
    loading: document.getElementById('loading'),
    errorMessage: document.getElementById('error-message')
};

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    elements.searchBtn.addEventListener('click', handleSearch);
    elements.cityInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') handleSearch();
    });
});

// Utilitaires d'UI
function showLoading(){ elements.loading.classList.remove('hidden'); elements.weatherSection.classList.add('hidden'); }
function hideLoading(){ elements.loading.classList.add('hidden'); }
function showError(msg){ elements.errorMessage.textContent = msg; elements.errorMessage.classList.remove('hidden'); }
function hideError(){ elements.errorMessage.classList.add('hidden'); }

// Recherche et API
async function handleSearch(){
    const query = elements.cityInput.value.trim();
    if (!query) { showError('Veuillez entrer un nom de ville.'); return; }

    hideError(); showLoading();

    try {
        const geoResp = await fetch(`${CONFIG.GEOCODING_API}?name=${encodeURIComponent(query)}&count=1&language=fr&format=json`);
        if (!geoResp.ok) throw new Error('Erreur de géocodage');
        const geoData = await geoResp.json();
        if (!geoData.results || geoData.results.length === 0) throw new Error('Ville non trouvée');

        const loc = geoData.results[0];
        const cityName = `${loc.name}${loc.admin1 ? ', '+loc.admin1 : ''}, ${loc.country}`;

        await fetchWeather(loc.latitude, loc.longitude, cityName);
    } catch (err) {
        hideLoading(); showError(err.message || 'Erreur');
    }
}

async function fetchWeather(lat, lon, cityName){
    try {
        const url = `${CONFIG.WEATHER_API}?latitude=${lat}&longitude=${lon}`+
            `&current_weather=true&hourly=temperature_2m,weather_code,precipitation_probability`+
            `&timezone=auto&forecast_days=1`;

        const resp = await fetch(url);
        if (!resp.ok) throw new Error('Erreur récupération météo');
        const data = await resp.json();

        displayWeather(data, cityName);
        checkWeatherAlerts(data, cityName);
        hideLoading();
    } catch (err){ hideLoading(); showError(err.message || 'Erreur météo'); }
}

function displayWeather(data, cityName){
    // Données actuelles si disponibles
    const current = data.current_weather || {};
    elements.cityName.textContent = cityName;
    elements.temperature.textContent = current.temperature ? Math.round(current.temperature) + '°C' : '-';
    elements.weatherIcon.textContent = current.weathercode !== undefined ? getWeatherEmoji(current.weathercode) : '';
    elements.wind.textContent = current.windspeed ? Math.round(current.windspeed)+' km/h' : '';
    elements.humidity.textContent = '';
    elements.feelsLike.textContent = '';

    // Prévisions horaires : construire les 4 prochaines heures depuis hourly
    const hourly = data.hourly ?? {};
    const times = hourly.time || [];
    const temps = hourly.temperature_2m || [];
    const codes = hourly.weather_code || hourly.weathercode || [];

    const now = new Date();
    const currentHour = now.getHours();
    const items = [];

    for (let i=1;i<=4;i++){
        const hourIndex = currentHour + i;
        if (hourIndex < times.length){
            const t = new Date(times[hourIndex]);
            const temp = temps[hourIndex];
            const code = codes[hourIndex];
            const isRain = CONFIG.RAIN_CODES.includes(code);
            const isHigh = temp > CONFIG.TEMP_THRESHOLD;
            const cls = isRain ? 'rain-alert' : (isHigh ? 'temp-alert' : '');
            items.push(`<div class="hourly-item ${cls}"><div class="hourly-time">${t.getHours()}h</div><div class="hourly-icon">${getWeatherEmoji(code)}</div><div class="hourly-temp">${Math.round(temp)}°C</div></div>`);
        }
    }

    elements.hourlyList.innerHTML = items.join('');
    elements.weatherSection.classList.remove('hidden');
}

function checkWeatherAlerts(data, cityName){
    const hourly = data.hourly ?? {};
    const times = hourly.time || [];
    const temps = hourly.temperature_2m || [];
    const codes = hourly.weather_code || hourly.weathercode || [];

    const now = new Date();
    const currentHour = now.getHours();

    let rainAlert=false, tempAlert=false, rainHour=null, highTemp=null;
    for (let i=1;i<=4;i++){
        const hourIndex = currentHour + i;
        if (hourIndex < times.length){
            const code = codes[hourIndex];
            const temp = temps[hourIndex];
            if (!rainAlert && CONFIG.RAIN_CODES.includes(code)) { rainAlert=true; rainHour=i; }
            if (!tempAlert && temp > CONFIG.TEMP_THRESHOLD) { tempAlert=true; highTemp=Math.round(temp); }
        }
    }

    // Demande permission puis envoie notification si nécessaire
    if ((rainAlert || tempAlert) && isNotificationSupported()){
        if (Notification.permission === 'granted') {
            if (rainAlert) sendWeatherNotification(cityName, `🌧️ Pluie prévue dans ${rainHour} heure${rainHour>1?'s':''} !`);
            if (tempAlert) sendWeatherNotification(cityName, `🌡️ Température > ${CONFIG.TEMP_THRESHOLD}°C (${highTemp}°C)`);
        } else if (Notification.permission !== 'denied'){
            Notification.requestPermission().then(p => {
                if (p === 'granted'){
                    if (rainAlert) sendWeatherNotification(cityName, `🌧️ Pluie prévue dans ${rainHour} heure${rainHour>1?'s':''} !`);
                    if (tempAlert) sendWeatherNotification(cityName, `🌡️ Température > ${CONFIG.TEMP_THRESHOLD}°C (${highTemp}°C)`);
                }
            });
        }
    }
}

function isNotificationSupported(){ return 'Notification' in window; }

function sendWeatherNotification(city, message){
    try{
        new Notification(`${city}`, { body: message, icon: 'icons/icon-192.png' });
    } catch (e){ console.warn('Notification échouée', e); }
}

// Mapper les codes météo en emojis
function getWeatherEmoji(code){
    const map = {0:'☀️',1:'🌤️',2:'⛅',3:'☁️',45:'🌫️',48:'🌫️',51:'🌦️',53:'🌦️',55:'🌧️',56:'🌨️',57:'🌨️',61:'🌧️',63:'🌧️',65:'🌧️',66:'🌨️',67:'🌨️',71:'🌨️',73:'🌨️',75:'❄️',77:'🌨️',80:'🌦️',81:'🌧️',82:'⛈️',85:'🌨️',86:'❄️',95:'⛈️',96:'⛈️',99:'⛈️'};
    return map[code] || '🌤️';
}
