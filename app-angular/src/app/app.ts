import { Component } from '@angular/core';
import { LinkedInInjector } from './components/linkedin-injector/linkedin-injector';

// Root of the hosted Angular app. The build is hosted and injected into
// LinkedIn, so the root renders the injector (the popup lives in the static
// injector extension, not here).
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [LinkedInInjector],
  template: `<app-linkedin-injector></app-linkedin-injector>`,
})
export class App {}
