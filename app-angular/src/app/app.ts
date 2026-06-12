import { Component, NgZone, OnInit } from '@angular/core';
import { ACTIVE_ENV_KEY, ENVIRONMENTS, getEnvById } from './core/constants';
import { Button } from './components/button/button';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [Button],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  envLabel = '';
  appDomain = ENVIRONMENTS[0]?.domain ?? '';
  version = '';

  constructor(private readonly zone: NgZone) {}

  ngOnInit(): void {
    this.version =
      typeof chrome !== 'undefined' && chrome.runtime?.getManifest
        ? chrome.runtime.getManifest().version
        : '';

    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get(ACTIVE_ENV_KEY, (result: Record<string, unknown>) => {
        const envId = (result[ACTIVE_ENV_KEY] as string) || ENVIRONMENTS[0].id;
        const env = getEnvById(envId) || ENVIRONMENTS[0];
        // chrome.* callbacks may run outside Angular's zone — re-enter so the view updates.
        this.zone.run(() => {
          this.envLabel = env.label;
          this.appDomain = env.domain;
        });
      });
    }
  }

  openDashboard(): void {
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url: this.appDomain });
    } else {
      window.open(this.appDomain, '_blank');
    }
  }
}
