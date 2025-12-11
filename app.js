// ===== Configuration =====
const CONFIG = {
    GEOCODING_API: 'https://geocoding-api.open-meteo.com/v1/search',
    WEATHER_API: 'https://api.open-meteo.com/v1/forecast',
    STORAGE_KEY_FAVORITES: 'meteo-pwa-favorites',
    STORAGE_KEY_THEME: 'meteo-pwa-theme',
    RAIN_CODES: [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99],
    TEMP_THRESHOLD: 10
};

// ===== Éléments DOM =====
const elements = {
    cityInput: document.getElementById('city-input'),
    searchBtn: document.getElementById('search-btn'),
    themeToggle: document.getElementById('theme-toggle'),
    weatherSection: document.getElementById('weather-section'),
    cityName: document.getElementById('city-name'),
    temperature: document.getElementById('temperature'),
    weatherIcon: document.getElementById('weather-icon'),
    wind: document.getElementById('wind'),
    humidity: document.getElementById('humidity'),
    feelsLike: document.getElementById('feels-like'),
    hourlyList: document.getElementById('hourly-list'),
    loading: document.getElementById('loading'),
    errorMessage: document.getElementById('error-message'),
    metaThemeColor: document.getElementById('meta-theme-color'),
    favoriteBtn: document.getElementById('favorite-btn'),
    favoritesList: document.getElementById('favorites-list'),
    noFavoritesMsg: document.getElementById('no-favorites')
};

// ===== État de l'application =====
let currentCity = null;
let favorites = [];

// ===== Initialisation =====
document.addEventListener('DOMContentLoaded', () => {
    registerServiceWorker();
    initTheme();
    loadFavorites();

    // Écouteurs UI
    elements.searchBtn?.addEventListener('click', handleSearch);
    elements.cityInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleSearch();
    });

    elements.themeToggle?.addEventListener('click', toggleTheme);
    elements.favoriteBtn?.addEventListener('click', toggleFavorite);
});

// ===== Service Worker =====
async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            await navigator.serviceWorker.register('./service-worker.js');
        } catch (error) { console.error('Erreur SW:', error); }
    }
}

// ===== Gestion des Favoris =====
function loadFavorites() {
    const stored = localStorage.getItem(CONFIG.STORAGE_KEY_FAVORITES);
    if (stored) {
        try {
            favorites = JSON.parse(stored);
        } catch (e) {
            favorites = [];
        }
    }
    renderFavorites();
}

function saveFavorites() {
    localStorage.setItem(CONFIG.STORAGE_KEY_FAVORITES, JSON.stringify(favorites));
    renderFavorites();
}

function isFavorite(city) {
    if (!city) return false;
    return favorites.some(f => f.name === city.name);
}

function toggleFavorite() {
    if (!currentCity) return;

    if (isFavorite(currentCity)) {
        // Supprimer
        favorites = favorites.filter(f => f.name !== currentCity.name);
        elements.favoriteBtn.textContent = '🤍';
        elements.favoriteBtn.classList.remove('active');
    } else {
        // Ajouter
        favorites.push(currentCity);
        elements.favoriteBtn.textContent = '❤️';
        elements.favoriteBtn.classList.add('active');
    }
    saveFavorites();
}

function renderFavorites() {
    elements.favoritesList.innerHTML = '';

    if (favorites.length === 0) {
        elements.noFavoritesMsg.classList.remove('hidden');
    } else {
        elements.noFavoritesMsg.classList.add('hidden');

        favorites.forEach(city => {
            const li = document.createElement('li');
            li.innerHTML = `
                <span>${city.name.split(',')[0]}</span>
                <button class="delete-fav" title="Supprimer">✕</button>
            `;

            // Clic sur le nom -> charge la ville
            li.querySelector('span').addEventListener('click', () => {
                loadFavoriteCity(city);
            });

            // Clic sur supprimer -> supprime le favori
            li.querySelector('.delete-fav').addEventListener('click', (e) => {
                e.stopPropagation();
                favorites = favorites.filter(f => f.name !== city.name);
                saveFavorites();
                // Si c'est la ville en cours, reset l'icône
                if (currentCity && currentCity.name === city.name) {
                    elements.favoriteBtn.textContent = '🤍';
                    elements.favoriteBtn.classList.remove('active');
                }
            });

            elements.favoritesList.appendChild(li);
        });
    }
}

async function loadFavoriteCity(city) {
    elements.cityInput.value = city.name.split(',')[0];
    await fetchWeather(city.lat, city.lon, city.name);
}

// ===== Gestion du Thème =====
function initTheme() {
    const savedTheme = localStorage.getItem(CONFIG.STORAGE_KEY_THEME);
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (savedTheme === 'dark' || (!savedTheme && systemPrefersDark)) {
        applyTheme('dark');
    } else {
        applyTheme('light');
    }
}

function toggleTheme() {
    const root = document.documentElement;
    const isDark = root.getAttribute('data-theme') === 'dark';
    const newTheme = isDark ? 'light' : 'dark';
    applyTheme(newTheme);
    localStorage.setItem(CONFIG.STORAGE_KEY_THEME, newTheme);
}

function applyTheme(theme) {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    if (theme === 'dark') {
        elements.themeToggle.textContent = '☀️';
        elements.metaThemeColor?.setAttribute('content', '#0f172a');
    } else {
        elements.themeToggle.textContent = '🌙';
        elements.metaThemeColor?.setAttribute('content', '#f6f9ff');
    }
}

// ===== Notifications =====
function isNotificationSupported() { return 'Notification' in window && typeof Notification !== 'undefined'; }

async function requestNotificationPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'denied') return;
    try { await Notification.requestPermission(); } catch (error) {}
}

function sendWeatherNotification(city, message, type) {
    if (!isNotificationSupported()) return;

    if (Notification.permission === 'granted') {
        const options = {
            body: `${city} — ${message}`,
            icon: 'icons/icon-192.png',
            tag: `meteo-${type}-${city}`,
            renotify: true
        };

        navigator.serviceWorker.getRegistration().then(reg => {
            if (reg && reg.showNotification) reg.showNotification('MeteoR', options);
            else new Notification('MeteoR', options);
        }).catch(() => {
            new Notification('MeteoR', options);
        });
    } else if (Notification.permission === 'default') {
        requestNotificationPermission().then(() => {
            if (Notification.permission === 'granted') sendWeatherNotification(city, message, type);
        });
    }
}

// ===== Recherche et API Météo =====
async function handleSearch() {
    const query = elements.cityInput.value.trim();
    if (!query) { showError('Veuillez entrer un nom de ville.'); return; }

    showLoading();
    hideError();

    try {
        const geoResponse = await fetch(
            `${CONFIG.GEOCODING_API}?name=${encodeURIComponent(query)}&count=1&language=fr&format=json`
        );
        if (!geoResponse.ok) throw new Error('Erreur de géocodage');
        const geoData = await geoResponse.json();

        if (!geoData.results || geoData.results.length === 0) {
            throw new Error(`Ville "${query}" non trouvée.`);
        }

        const location = geoData.results[0];
        const cityName = `${location.name}${location.admin1 ? ', ' + location.admin1 : ''}, ${location.country}`;

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
            `&hourly=temperature_2m,weather_code` +
            `&timezone=auto&forecast_days=1`
        );

        if (!weatherResponse.ok) throw new Error('Erreur météo');

        const weatherData = await weatherResponse.json();
        currentCity = { name: cityName, lat, lon };

        displayWeather(weatherData, cityName);
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

    elements.cityName.textContent = cityName;
    elements.temperature.textContent = Math.round(current.temperature_2m);
    elements.weatherIcon.textContent = getWeatherEmoji(current.weather_code);
    elements.wind.textContent = `${Math.round(current.wind_speed_10m)} km/h`;
    elements.humidity.textContent = `${current.relative_humidity_2m} %`;
    elements.feelsLike.textContent = `${Math.round(current.apparent_temperature)}°C`;

    // Mise à jour de l'état du cœur
    if (isFavorite(currentCity)) {
        elements.favoriteBtn.textContent = '❤️';
        elements.favoriteBtn.classList.add('active');
    } else {
        elements.favoriteBtn.textContent = '🤍';
        elements.favoriteBtn.classList.remove('active');
    }

    // Heures
    const currentHour = new Date().getHours();
    const hourlyItems = [];
    for (let i = 0; i < 5; i++) {
        const hourIndex = currentHour + i + 1;
        if (hourIndex < hourly.time.length) {
            const time = new Date(hourly.time[hourIndex]);
            const temp = hourly.temperature_2m[hourIndex];
            const code = hourly.weather_code[hourIndex];
            const isRain = CONFIG.RAIN_CODES.includes(code);
            const isHighTemp = temp > CONFIG.TEMP_THRESHOLD;
            let alertClass = isRain ? 'rain-alert' : (isHighTemp ? 'temp-alert' : '');

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
    const currentHour = new Date().getHours();
    let rainAlert = false;
    let tempAlert = false;
    let rainHour = null;
    let highTemp = null;

    for (let i = 1; i <= 4; i++) {
        const hourIndex = currentHour + i;
        if (hourIndex < hourly.time.length) {
            const code = hourly.weather_code[hourIndex];
            const temp = hourly.temperature_2m[hourIndex];

            if (!rainAlert && CONFIG.RAIN_CODES.includes(code)) {
                rainAlert = true;
                rainHour = i;
            }
            if (!tempAlert && temp > CONFIG.TEMP_THRESHOLD) {
                tempAlert = true;
                highTemp = Math.round(temp);
            }
        }
    }

    if (rainAlert) sendWeatherNotification(cityName, `🌧️ Pluie dans ${rainHour}h !`, 'rain');
    if (tempAlert) sendWeatherNotification(cityName, `🌡️ Température > ${CONFIG.TEMP_THRESHOLD}°C (${highTemp}°C)`, 'temp');
}

function getWeatherEmoji(code) {
    const map = {
        0:'☀️', 1:'🌤️', 2:'⛅', 3:'☁️', 45:'🌫️', 48:'🌫️',
        51:'🌦️', 53:'🌦️', 55:'🌧️', 56:'🌨️', 57:'🌨️',
        61:'🌧️', 63:'🌧️', 65:'🌧️', 66:'🌨️', 67:'🌨️',
        71:'🌨️', 73:'🌨️', 75:'❄️', 77:'🌨️',
        80:'🌦️', 81:'🌧️', 82:'⛈️', 85:'🌨️', 86:'❄️',
        95:'⛈️', 96:'⛈️', 99:'⛈️'
    };
    return map[code] || '🌤️';
}

function showLoading() { elements.loading.classList.remove('hidden'); elements.weatherSection.classList.add('hidden'); }
function hideLoading() { elements.loading.classList.add('hidden'); }
function showError(msg) { elements.errorMessage.textContent = msg; elements.errorMessage.classList.remove('hidden'); }
function hideError() { elements.errorMessage.classList.add('hidden'); }