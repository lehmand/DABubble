import { CommonModule } from '@angular/common';
import { Component, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { LoginAuthService } from '../services/login-auth.service';
import { Subscription } from 'rxjs';
import { GlobalVariableService } from '../services/global-variable.service';
import { WorkspaceComponent } from '../workspace/workspace.component';

@Component({
  selector: 'app-welcome-sheet',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './welcome-sheet.component.html',
  styleUrl: './welcome-sheet.component.scss',
})
export class WelcomeSheetComponent implements OnInit {
  isGuestAccount = false;
  LogInAuth = inject(LoginAuthService);
  private guestLoginStatusSub: Subscription | undefined;
  globalService = inject(GlobalVariableService)
  @Output() closeWelcome = new EventEmitter<void>();

  ngOnInit(): void {
    this.subscribeToGuestLoginStatus();
  }

  subscribeToGuestLoginStatus(): void {
    this.guestLoginStatusSub = this.LogInAuth.isGuestLogin$.subscribe(
      (status) => {
        this.isGuestAccount = status;
      }
    );
  }

  closeWelcomeScreen() {
    this.closeWelcome.emit();
  }
}
