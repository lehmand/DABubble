import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ImpressumComponent } from './impressum/impressum.component';
import { PrivacyPolicyComponent } from './privacy-policy/privacy-policy.component';
import { AuthService } from './services/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    ImpressumComponent,
    PrivacyPolicyComponent,

  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  title = 'da-bubble';
  aaa: boolean = false;

  constructor(
    private authService: AuthService,
  ){

  }

  ngOnInit(): void {
    this.authService.handleRedirectResult()
  }
}
