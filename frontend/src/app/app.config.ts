import { ApplicationConfig, LOCALE_ID, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import { provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';
import { authInterceptor } from './guards/auth.interceptor';

import { routes } from './app.routes';

// Every amount ({{ x | number }}) is written the French way (space between thousands, comma before
// the decimals, e.g. "4 090,000") instead of Angular's English default ("4,090.000"), which mixed a
// comma and a dot together and read oddly.
registerLocaleData(localeFr);

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    { provide: LOCALE_ID, useValue: 'fr' },
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideTranslateService(),
    provideTranslateHttpLoader({
      prefix: './assets/i18n/',
      suffix: '.json'
    })
  ]
};
