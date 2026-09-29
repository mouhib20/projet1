import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { UpdateBannerComponent } from './offline/update-banner/update-banner.component';
import { SyncWarningsBannerComponent } from './offline/sync-warnings-banner/sync-warnings-banner.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, UpdateBannerComponent, SyncWarningsBannerComponent],
  template: `<router-outlet /><app-update-banner /><app-sync-warnings-banner />`,
  styles: []
})
export class AppComponent {
  constructor(private translate: TranslateService) {
    this.translate.setFallbackLang('fr');
    // Check if there is a saved language in localstorage, fallback to default if none
    const browserLang = this.translate.getBrowserLang();
    this.translate.use(browserLang?.match(/en|fr|ar/) ? browserLang : 'fr');
  }
}
