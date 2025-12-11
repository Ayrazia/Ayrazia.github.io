// ===== Configuration =====
const CONFIG = {
    GEOCODING_API: 'https://geocoding-api.open-meteo.com/v1/search',
    WEATHER_API: 'https://api.open-meteo.com/v1/forecast',
    STORAGE_KEY_FAVORITES: 'meteo-pwa-favorites',
    STORAGE_KEY_THEME: 'meteo-pwa-theme',
    RAIN_CODES: [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99],
    TEMP_THRESHOLD: 10 // Température seuil pour notification
};

// ===== Éléments DOM =====
const elements = {
    cityInput: document.getElementById('city-input'),
    searchBtn: document.getElementById('search-btn'),
    themeToggle: document.getElementById('theme-toggle'),
    weatherSection: document.getElementById('weather-section'),
    favoritesSection: document.getElementById('favorites-section'),
    favoritesList: document.getElementById('favorites-list'),
    favoriteBtn: document.getElementById('favorite-btn'),
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

// ===== État de l'application =====
let currentCity = null;

// ===== Initialisation =====
document.addEventListener('DOMContentLoaded', () => {
    registerServiceWorker();

    // Chargement du thème
    initTheme();

    // Écouteurs UI
    elements.searchBtn?.addEventListener('click', handleSearch);
    elements.cityInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleSearch();
    });

    // Theme toggle
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }
});

// ===== THEME =====
function initTheme() {
    try {
        const saved = localStorage.getItem(CONFIG.STORAGE_KEY_THEME);
        if (saved === 'dark') {
            document.body.classList.add('dark');
            const btn = document.getElementById('theme-toggle');
            if (btn) { btn.setAttribute('aria-pressed', 'true'); btn.textContent = '☀️'; }
        }
    } catch (e) {
        // ignore localStorage errors
    }
}

function toggleTheme() {
    const isDark = document.body.classList.toggle('dark');
    try {
        localStorage.setItem(CONFIG.STORAGE_KEY_THEME, isDark ? 'dark' : 'light');
    } catch (e) {}

    const btn = document.getElementById('theme-toggle');
    if (btn) {
        btn.setAttribute('aria-pressed', isDark ? 'true' : 'false');
        btn.textContent = isDark ? '☀️' : '🌙';
    }
}

// ===== Service Worker =====
async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('./service-worker.js');
            console.log('✅ Service Worker enregistré:', registration.scope);
        } catch (error) {
            console.error('❌ Erreur Service Worker:', error);
        }
    }
}

// ===== Notifications =====
function isNotificationSupported() {
    return 'Notification' in window && typeof Notification !== 'undefined';
}

async function requestNotificationPermission() {
    if (!('Notification' in window)) {
        // Ne pas afficher d'erreur UI pour rester minimal
        return;
    }

    if (Notification.permission === 'denied') {
        return;
    }

    try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            // Notification de test silencieuse
            try {
                new Notification('MeteoR', {
                    body: 'Notifications activées',
                    icon: 'icons/icon-192.png'
                });
            } catch (e) {}
        }
    } catch (error) {
        console.error('Erreur lors de la demande de permission:', error);
    }
}

function sendWeatherNotification(city, message, type = 'info') {
    if (!isNotificationSupported()) return;

    if (Notification.permission === 'granted') {
        navigator.serviceWorker.getRegistration().then(reg => {
            const options = {
                body: `${city} — ${message}`,
                icon: 'icons/icon-192.png',
                tag: `meteo-${type}-${city}`,
                renotify: true
            };

            if (reg && reg.showNotification) {
                reg.showNotification('MeteoR', options);
            } else {
                // Fallback si pas de SW ou showNotification
                new Notification('MeteoR', options);
            }
        }).catch(err => {
            console.error('Erreur récupération registration SW:', err);
            // Fallback
            try { new Notification('MeteoR', { body: `${city} — ${message}`, icon: 'icons/icon-192.png' }); } catch(e){}
        });
    } else if (Notification.permission === 'default') {
        // Tenter de demander la permission avant d'envoyer
        requestNotificationPermission().then(() => {
            if (Notification.permission === 'granted') {
                sendWeatherNotification(city, message, type);
            }
        });
    }
}

// ===== Recherche et API Météo =====
async function handleSearch() {
    const query = elements.cityInput.value.trim();
    
    if (!query) {
        showError('Veuillez entrer un nom de ville.');
        return;
    }

    showLoading();
    hideError();

    try {
        // 1. Géocodage : trouver les coordonnées de la ville
        const geoResponse = await fetch(
            `${CONFIG.GEOCODING_API}?name=${encodeURIComponent(query)}&count=1&language=fr&format=json`
        );
        
        if (!geoResponse.ok) throw new Error('Erreur de géocodage');
        
        const geoData = await geoResponse.json();
        
        if (!geoData.results || geoData.results.length === 0) {
            throw new Error(`Ville "${query}" non trouvée. Vérifiez l'orthographe.`);
        }

        const location = geoData.results[0];
        const cityName = `${location.name}${location.admin1 ? ', ' + location.admin1 : ''}, ${location.country}`;
        
        // 2. Récupérer la météo
        await fetchWeather(location.latitude, location.longitude, cityName);
        
    } catch (error) {
        hideLoading();
        showError(error.message);
    }
}

async function fetchWeather(lat, lon, cityName) {
    showLoading();
    hideError();

    try {
        const weatherResponse = await fetch(
            `${CONFIG.WEATHER_API}?latitude=${lat}&longitude=${lon}` +
            `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m` +
            `&hourly=temperature_2m,weather_code,precipitation_probability` +
            `&timezone=auto&forecast_days=1`
        );

        if (!weatherResponse.ok) throw new Error('Erreur lors de la récupération des données météo');

        const weatherData = await weatherResponse.json();
        
        // Sauvegarder la ville courante
        currentCity = { name: cityName, lat, lon };
        
        // Afficher les résultats
        displayWeather(weatherData, cityName);
        
        // Vérifier les alertes pour les 4 prochaines heures
        checkWeatherAlerts(weatherData, cityName);
        
        hideLoading();
        
    } catch (error) {
        hideLoading();
        showError(error.message);
    }
}

function displayWeather(data, cityName) {
    const current = data.current;
    const hourly = data.hourly;

    // Données actuelles
    elements.cityName.textContent = cityName;
    elements.temperature.textContent = Math.round(current.temperature_2m);
    elements.weatherIcon.textContent = getWeatherEmoji(current.weather_code);
    elements.wind.textContent = `${Math.round(current.wind_speed_10m)} km/h`;
    elements.humidity.textContent = `${current.relative_humidity_2m} %`;
    elements.feelsLike.textContent = `${Math.round(current.apparent_temperature)}°C`;

    // Trouver l'index de l'heure courante dans hourly.time (première heure future)
    const now = Date.now();
    let currentIndex = hourly.time.findIndex(t => new Date(t).getTime() > now);
    if (currentIndex === -1) currentIndex = 0; // fallback

    // Prévisions horaires (4 prochaines heures)
    const hourlyItems = [];

    for (let i = 0; i < 4; i++) {
        const hourIndex = currentIndex + i;
        if (hourIndex < hourly.time.length) {
            const time = new Date(hourly.time[hourIndex]);
            const temp = hourly.temperature_2m[hourIndex];
            const code = hourly.weather_code[hourIndex];
            const isRain = CONFIG.RAIN_CODES.includes(code);
            const isHighTemp = temp > CONFIG.TEMP_THRESHOLD;

            let alertClass = '';
            if (isRain) alertClass = 'rain-alert';
            else if (isHighTemp) alertClass = 'temp-alert';

            hourlyItems.push(`
                <div class="hourly-item ${alertClass}">
                    <div class="hourly-time">${time.getHours()}h</div>
                    <div class="hourly-icon">${getWeatherEmoji(code)}</div>
                    <div class="hourly-temp">${Math.round(temp)}°C</div>
                </div>
            `);
        }
    }

    elements.hourlyList.innerHTML = hourlyItems.join('');
    elements.weatherSection.classList.remove('hidden');
}

function checkWeatherAlerts(data, cityName) {
    const hourly = data.hourly;
    const now = Date.now();
    let currentIndex = hourly.time.findIndex(t => new Date(t).getTime() > now);
    if (currentIndex === -1) currentIndex = 0;

    let rainAlert = false;
    let tempAlert = false;
    let rainHour = null;
    let highTemp = null;

    // Vérifier les 4 prochaines heures
    for (let i = 0; i < 4; i++) {
        const hourIndex = currentIndex + i;
        if (hourIndex < hourly.time.length) {
            const code = hourly.weather_code[hourIndex];
            const temp = hourly.temperature_2m[hourIndex];

            // Vérifier la pluie
            if (!rainAlert && CONFIG.RAIN_CODES.includes(code)) {
                rainAlert = true;
                rainHour = i + 1; // i=0 => dans 1 heure
            }

            // Vérifier la température > 10°C
            if (!tempAlert && temp > CONFIG.TEMP_THRESHOLD) {
                tempAlert = true;
                highTemp = Math.round(temp);
            }
        }
    }

    // Envoyer les notifications
    if (rainAlert) {
        sendWeatherNotification(
            cityName,
            `🌧️ Pluie prévue dans ${rainHour} heure${rainHour > 1 ? 's' : ''} !`,
            'rain'
        );
    }

    if (tempAlert) {
        sendWeatherNotification(
            cityName,
            `🌡️ Température supérieure à ${CONFIG.TEMP_THRESHOLD}°C prévue (${highTemp}°C)`,
            'temp'
        );
    }
}

// ===== Utilitaires =====
function getWeatherEmoji(code) {
    const weatherEmojis = {
        0: '☀️',      // Clear sky
        1: '🌤️',     // Mainly clear
        2: '⛅',      // Partly cloudy
        3: '☁️',      // Overcast
        45: '🌫️',    // Fog
        48: '🌫️',    // Depositing rime fog
        51: '🌦️',    // Light drizzle
        53: '🌦️',    // Moderate drizzle
        55: '🌧️',    // Dense drizzle
        56: '🌨️',    // Light freezing drizzle
        57: '🌨️',    // Dense freezing drizzle
        61: '🌧️',    // Slight rain
        63: '🌧️',    // Moderate rain
        65: '🌧️',    // Heavy rain
        66: '🌨️',    // Light freezing rain
        67: '🌨️',    // Heavy freezing rain
        71: '🌨️',    // Slight snow
        73: '🌨️',    // Moderate snow
        75: '❄️',     // Heavy snow
        77: '🌨️',    // Snow grains
        80: '🌦️',    // Slight rain showers
        81: '🌧️',    // Moderate rain showers
        82: '⛈️',     // Violent rain showers
        85: '🌨️',    // Slight snow showers
        86: '❄️',     // Heavy snow showers
        95: '⛈️',     // Thunderstorm
        96: '⛈️',     // Thunderstorm with slight hail
        99: '⛈️'      // Thunderstorm with heavy hail
    };
    
    return weatherEmojis[code] || '🌤️';
}

function showLoading() {
    elements.loading.classList.remove('hidden');
    elements.weatherSection.classList.add('hidden');
}

function hideLoading() {
    elements.loading.classList.add('hidden');
}

function showError(message) {
    elements.errorMessage.textContent = message;
    elements.errorMessage.classList.remove('hidden');
}

function hideError() {
    elements.errorMessage.classList.add('hidden');
}
