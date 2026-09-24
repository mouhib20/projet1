import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { environment } from './environments/environment';

/**
 * Optional runtime settings: public/config.json can hold the address of the API (apiUrl) and of
 * the uploaded files (filesUrl) so the same build works on any host without recompiling.
 * Empty values keep the defaults of the environment file.
 */
async function chargerConfig(): Promise<void> {
  try {
    const rep = await fetch('config.json', { cache: 'no-store' });
    if (!rep.ok) return;
    const cfg = await rep.json();
    if (cfg?.apiUrl) environment.apiUrl = String(cfg.apiUrl).replace(/\/+$/, '');
    if (cfg?.filesUrl) environment.filesUrl = String(cfg.filesUrl).replace(/\/+$/, '');
  } catch {
    // no config file: defaults apply
  }
}

chargerConfig().then(() =>
  bootstrapApplication(AppComponent, appConfig).catch((err) => console.error(err))
);
