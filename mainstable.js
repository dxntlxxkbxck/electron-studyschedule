// main.js
const { app, BrowserWindow, Tray, nativeImage, screen, globalShortcut } = require('electron');
const path = require('path');
const isDev = process.argv.includes('--dev');

let mainWindow = null;
let widgetWindow = null;
let tray = null;
let widgetHideTimeout = null;
let mouseInsideWidget = false;

function clearWidgetTimeout() {
    if (widgetHideTimeout) {
        clearTimeout(widgetHideTimeout);
        widgetHideTimeout = null;
    }
}

// возвращает url с рабочим днем (сегодня пн-пт или следующий понедельник)
function getWorkdayUrl() {
    const now = new Date();
    const dayOfWeek = now.getDay();
    
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `https://schedule.mstimetables.ru/publications/cdb2a14c-a891-4f9f-b56c-7e8eb559c766#/groups/140/lessons?date=${year}-${month}-${day}`;
    } else {
        const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
        const nextMonday = new Date(now);
        nextMonday.setDate(now.getDate() + daysUntilMonday);
        const year = nextMonday.getFullYear();
        const month = String(nextMonday.getMonth() + 1).padStart(2, '0');
        const day = String(nextMonday.getDate()).padStart(2, '0');
        return `https://schedule.mstimetables.ru/publications/cdb2a14c-a891-4f9f-b56c-7e8eb559c766#/groups/140/lessons?date=${year}-${month}-${day}`;
    }
}

// инжектит titlebar и скрывает скролл для главного окна
const mainRendererJsCode = `
(function() {
    var titlebar = document.getElementById('custom-titlebar');
    if (titlebar) return;
    
    titlebar = document.createElement('div');
    titlebar.id = 'custom-titlebar';
    titlebar.innerHTML = '<div style="height:35px;background:#1a1a1a;display:flex;align-items:center;justify-content:center;padding:0 15px;font-weight:600;font-size:13px;position:fixed;top:0;left:0;right:0;z-index:99999;-webkit-app-region:drag;"><span style="color:white;">Расписание</span></div>';
    
    document.body.style.paddingTop = '35px';
    document.body.style.margin = '0';
    document.body.style.overflow = 'hidden';
    
    var scrollStyle = document.querySelector('style[data-scroll]');
    if (!scrollStyle) {
        scrollStyle = document.createElement('style');
        scrollStyle.setAttribute('data-scroll', 'true');
        scrollStyle.innerText = '::-webkit-scrollbar{display:none;}*{scrollbar-width:none;-ms-overflow-style:none;}html{overflow:hidden;}';
        document.head.appendChild(scrollStyle);
    }
    
    document.body.insertBefore(titlebar, document.body.firstChild);
})();
`;

// инжектит стили для виджета (скрывает скролл)
const widgetRendererJsCode = `
(function() {
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.style.overflow = 'auto';
    document.documentElement.style.webkitAppRegion = 'no-drag';
    
    var style = document.querySelector('style[data-scroll]');
    if (!style) {
        style = document.createElement('style');
        style.setAttribute('data-scroll', 'true');
        style.innerText = '::-webkit-scrollbar{display:none;}*{scrollbar-width:none;-ms-overflow-style:none;}';
        document.head.appendChild(style);
    }
})();
`;

function createWindowWithTitlebar(width, height, alwaysOnTop, isWidget) {
    const win = new BrowserWindow({
        width: width,
        height: height,
        alwaysOnTop: alwaysOnTop,
        frame: false,
        resizable: false,
        movable: !isWidget,
        skipTaskbar: alwaysOnTop,
        show: false,
        titleBarStyle: 'hidden',
        webPreferences: { 
            nodeIntegration: true, 
            contextIsolation: false, 
            webSecurity: false 
        }
    });

    // вставляет стили после загрузки страницы
    function injectCode() {
        if (!win.isDestroyed()) {
            win.webContents.executeJavaScript(isWidget ? widgetRendererJsCode : mainRendererJsCode)
                .catch(function(err) { console.log('Инъекция:', err.message); });
        }
    }
    
    win.loadURL(getWorkdayUrl());
    
    win.webContents.on('did-finish-load', injectCode);
    win.webContents.on('dom-ready', injectCode);
    setTimeout(injectCode, 300);
    
    if (isDev) {
        win.webContents.openDevTools({ mode: 'detach' });
    }
    
    // очищает переменные при закрытии окна
    win.on('closed', function() {
        clearWidgetTimeout();
        mouseInsideWidget = false;
        if (win === mainWindow) mainWindow = null;
        if (win === widgetWindow) widgetWindow = null;
    });
    
    return win;
}

// создает или показывает главное окно
function createMainWindow() {
    console.log('главное окно');
    if (mainWindow && !mainWindow.isDestroyed()) {
        console.log('показываем существующее');
        mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
        return;
    }
    
    mainWindow = createWindowWithTitlebar(1200, 800, false, false);
    mainWindow.once('ready-to-show', function() {
        mainWindow.show();
        mainWindow.focus();
        console.log('главное окно готово');
    });
}

// переключает виджет (toggle)
function toggleWidget() {
    if (widgetWindow && !widgetWindow.isDestroyed()) {
        widgetWindow.close();
        return;
    }

    widgetWindow = createWindowWithTitlebar(360, 500, true, true);
    
    // позиционирует виджет рядом с треем
    widgetWindow.once('ready-to-show', function() {
        if (!widgetWindow.isDestroyed() && tray) {
            const trayBounds = tray.getBounds();
            const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y });
            
            let x = trayBounds.x + trayBounds.width + 5;
            if (x + 360 > display.bounds.width) x = trayBounds.x - 365;
            
            widgetWindow.setBounds({
                x: Math.max(display.bounds.x, x),
                y: trayBounds.y + trayBounds.height + 8,
                width: 360,
                height: 500
            });
            widgetWindow.show();
            console.log('виджет готов');
        }
    });

    clearWidgetTimeout();
    mouseInsideWidget = false;
    
    // автозакрытие виджета через 3 секунды
    function handleMouseEnter() { 
        mouseInsideWidget = true; 
        clearWidgetTimeout(); 
    }
    function handleMouseLeave() { 
        mouseInsideWidget = false; 
        startHideTimeout(); 
    }
    function startHideTimeout() {
        clearWidgetTimeout();
        widgetHideTimeout = setTimeout(function() {
            if (widgetWindow && !widgetWindow.isDestroyed() && !mouseInsideWidget) {
                widgetWindow.close();
            }
        }, 3000);
    }
    
    widgetWindow.on('mouseenter', handleMouseEnter);
    widgetWindow.on('mouseleave', handleMouseLeave);
}

app.whenReady().then(function() {
    // создает иконку в трее
    try {
        const icon = nativeImage.createFromPath(path.join(__dirname, 'library.png'));
        icon.setTemplateImage(true);
        tray = new Tray(icon);
    } catch (e) {
        console.log('нет иконки');
    }
    
    tray.setToolTip('1 клик=виджет, 2 клика=полное');
    
    // обработчики кликов по трею
    tray.on('click', function() {
        console.log('1 клик виджет');
        toggleWidget();
    });
    
    tray.on('double-click', function() {
        console.log('2 клик главное');
        if (widgetWindow && !widgetWindow.isDestroyed()) {
            widgetWindow.close();
        }
        createMainWindow();
    });
    
    globalShortcut.register('CommandOrControl+Shift+S', toggleWidget);
    console.log('запущено');
});

app.on('window-all-closed', function() {
    if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', function() {
    globalShortcut.unregisterAll();
});
