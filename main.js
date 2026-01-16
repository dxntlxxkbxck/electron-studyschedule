const { app, BrowserWindow, Tray, Menu, ipcMain } = require('electron');
const { type } = require('os');
const path = require('path');
const isDev = process.argv.includes('--dev');

let mainWindow; // переменная всей недели
let todayWindow; // переменная для виджета "сегодня"

// функция создания главного окна
function createMainWindow() {
	mainWindow = new BrowserWindow({
		width: 1200,
		height: 800,
		webPreferences: {
			nodeIntegration: false,
			contextIsolation: true,
			preload: path.join(__dirname, 'preload.js') // подключаем preload.js
		},
		titleBarStyle: 'hidden', // убираем стандартный заголовок на маке
		title: 'Расписание'
	});

	// подгружаем html главной страницы
	mainWindow.loadFile('src/index.html');

	// devtools
	if (isDev) mainWindow.webContents.openDevTools();

	// сейвы
	mainWindow.on('closed', () => mainWindow = null);
}

// видежет "сегодня"
function createTodayWindow () {
	todayWindow = new BrowserWindow({
		width: 400,
		height: 500,
		alwaysOnTop: true, // поверх всех окон
		frame: false, // без рамки
		webPreferences: {
			nodeIntegration: false,
			contextIsolation: true,
			preload: path.join(__dirname, 'preload.js')
		}
	});

	todayWindow.loadfile('src/today.html');

	// скрываем из док/таскбара
	todayWindow.setSkipTaskbar(true);

	if (isDev) todayWindow.webContents.openDevTools();
}

// система трея (иконка в панели задач)
let tray = null;
app.whenReady().then(() => {
	// трей с иконкой
	tray = new Tray(path.join(__dirname, 'library.png')); // icon

	const contextMenu = Menu.buildFromTemplate([
		{ label: 'Открыть неделю', click: () => createMainWindow() },
		{ label: 'Сегодня', click: () => createTodayWindow() },
		{ type: 'separator' },
		{ label: 'Выход', click: () => app.quit() }
	]);

	tray.setContextMenu(contextMenu); // правая кнопка на иконке
	tray.setToolTip('Расписание');

	// при первом запуске открываем главное окно
	createMainWindow();
});

// ipc связь между главным процессом и рендером
ipcMain.handle('show-today', () => {
	if (todayWindow) todayWindow.close();
	createTodayWindow();
});

// закрытие всех окон при выходе
app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') app.quit(); // на маке оставляем трей
});