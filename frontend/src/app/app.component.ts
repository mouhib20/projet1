import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `<router-outlet />`,
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
