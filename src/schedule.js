const puppeteer = require('puppeteer-core');

class ScheduleParser {
    static SCHEDULE_URL = 'https://schedule.mstimetables.ru/publications/cdb2a14c-a891-4f9f-b56c-7e8eb559c766#/groups/140/lessons';

    // кэш данных (30 минут)
    static cache = null;
    static cacheTime = 0;
    static CACHE_DURATION = 30 * 60 * 1000;

    // получаем неделю
    static async getWeekSchedule() {
        // Проверяем свежий кэш
        if (this.cache && Date.now() - this.cacheTime < this.CACHE_DURATION) {
            console.log('✅ Используем кэш расписания');
            return this.cache;
        }

        try {
            console.log('🔄 Загружаем реальное расписание с MSTimetables...');
            
            const browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            
            const page = await browser.newPage();
            await page.goto(this.SCHEDULE_URL, { waitUntil: 'networkidle2' });
            
            // ждем расписание группы 140
            await page.waitForTimeout(3000);
            
            // парсинг — ищем все возможные элементы
            const scheduleData = await page.evaluate(() => {
                const week = [];
                const daysRu = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
                
                // ищем ТОЧНО элементы MSTimetables
                const dayElements = document.querySelectorAll('[class*="day"], [class*="week"], h2, h3, .day-header, [data-day]');
                const lessonElements = document.querySelectorAll('[class*="lesson"], [class*="subject"], tr, .timetable-row, [data-lesson]');
                
                let currentDay = 0;
                
                // группируем по дням
                lessonElements.forEach((lesson, index) => {
                    // если нашли новый день — переключаемся
                    const dayHeader = lesson.closest('[class*="day"], h2, h3')?.textContent;
                    if (dayHeader && dayHeader.includes('неде')) currentDay++;
                    
                    // извлекаем информацию об уроке
                    const time = lesson.querySelector('[class*="time"], [class*="hour"]')?.textContent || '';
                    const subject = lesson.querySelector('[class*="subject"], [class*="lesson"], h4')?.textContent || '';
                    const teacher = lesson.querySelector('[class*="teacher"], [class*="lecturer"]')?.textContent || '';
                    const room = lesson.querySelector('[class*="room"], [class*="class"], [class*="auditorium"]')?.textContent || '';
                    
                    if (subject) {
                        if (!week[currentDay]) {
                            week[currentDay] = { 
                                day: daysRu[currentDay] || `День ${currentDay + 1}`, 
                                lessons: [] 
                            };
                        }
                        
                        const lessonText = [time, subject];
                        if (teacher) lessonText.push(teacher);
                        if (room) lessonText.push(room);
                        
                        week[currentDay].lessons.push(lessonText.filter(Boolean).join(' '));
                    }
                });
                
                return week.filter(day => day && day.lessons.length > 0);
            });
            
            await browser.close();
            
            if (scheduleData.length === 0) {
                throw new Error('Не удалось найти уроки на странице');
            }
            
            this.cache = scheduleData;
            this.cacheTime = Date.now();
            
            console.log(`✅ Загружено ${scheduleData.length} дней с реальными уроками`);
            return scheduleData;
            
        } catch (error) {
            console.error('❌ Ошибка загрузки расписания:', error.message);
            throw new Error(`Не удалось загрузить расписание: ${error.message}. Проверь интернет или сайт.`);
        }
    }

    // день недели по индексу (0, 1, 2...)
    static async getDaySchedule(dayIndex) {
        try {
            const week = await this.getWeekSchedule();
            const dayData = week[dayIndex] || { day: 'Нет данных', lessons: [] };
            
            // если сегодня — пишем "Сегодня"
            if (dayIndex === new Date().getDay()) {
                dayData.day = 'Сегодня';
            }
            
            return dayData;
        } catch (error) {
            throw error;
        }
    }

    static getCurrentDayName() {
        const days = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
        return days[new Date().getDay()];
    }
}

module.exports = ScheduleParser;
