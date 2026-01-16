const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
	// функция для показа виджета "сегодня"
	showTodayWidget: () => ipcRenderer.invoke('show-today')
});