import {
  Component,
  Input,
  OnChanges,
  SimpleChanges,
  OnInit,
  inject,
  ChangeDetectorRef,
  OnDestroy,
  Output,
  EventEmitter,
} from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { CommonModule } from '@angular/common';
import { GlobalVariableService } from '../services/global-variable.service';
import { FormsModule } from '@angular/forms';
import { Firestore, doc, getDoc, onSnapshot } from '@angular/fire/firestore';
import { ActivatedRoute } from '@angular/router';
import { UserService } from '../services/user.service';
import { User } from '../models/user.class';
import { PeopleMentionComponent } from '../people-mention/people-mention.component';
import { DialogHeaderProfilCardComponent } from '../dialog-header-profil-card/dialog-header-profil-card.component';
import { OverlayStatusService } from '../services/overlay-status.service';
import { DialogEditChannelComponent } from '../dialog-edit-channel/dialog-edit-channel.component';
import { MatDialog } from '@angular/material/dialog';
import { DialogChannelUserComponent } from '../dialog-channel-user/dialog-channel-user.component';
import { DialogAddMemberComponent } from '../dialog-add-member/dialog-add-member.component';
import { ProfileContactCardComponent } from '../profile-contact-card/profile-contact-card.component';
import { ChatComponent } from '../chat/chat.component';
import { WelcomeSheetComponent } from '../welcome-sheet/welcome-sheet.component';
import { Subscription } from 'rxjs';
import { LoginAuthService } from '../services/login-auth.service';
import { AuthService } from '../services/auth.service';
import { SelectionService } from '../services/selection.service';

interface ChannelData {
  userIds: string[];
}

@Component({
  selector: 'app-start-screen',
  standalone: true,
  imports: [
    MatCardModule,
    MatButtonModule,
    CommonModule,
    FormsModule,
    DialogHeaderProfilCardComponent,
    ProfileContactCardComponent,
    ChatComponent,
    WelcomeSheetComponent,
  ],
  templateUrl: './start-screen.component.html',
  styleUrl: './start-screen.component.scss',
})
export class StartScreenComponent implements OnInit, OnChanges, OnDestroy {
  user: any;
  constructor(public global: GlobalVariableService) {}
  afterLoginSheet: boolean = false;
  loginSuccessful = false;
  isGuestLogin = false;
  welcomeChannelSubscription: Subscription | undefined;
  currentUserwasSelected = false;
  contactWasSelected = false;
  overlayStatusService = inject(OverlayStatusService);
  openMyProfile = false;
  firestore = inject(Firestore);
  userId: any | null = null;
  route = inject(ActivatedRoute);
  auth = inject(AuthService)
  @Input() selectedUser: any;
  @Input() selectedChannel: any;
  @Input() mentionUser: string = '';
  @Input() onHeaderUser: any;
  @Input() onHeaderChannel: any;
  @Output() userSelectedFromStartscreen = new EventEmitter<any>();
  @Output() channelSelectedFromStartscreen = new EventEmitter<any>();
  channelMembers: any[] = [];
  messagesData: any = [];
  commentImages: string[] = [
    '../../assets/img/comment/hand.png',
    '../../assets/img/comment/celebration.png',
  ];
  commentStricker: string[] = [
    '../../assets/img/comment/face.png',
    '../../assets/img/comment/rocket.png',
  ];
  concatStickerArray: string[] = [
    ...this.commentImages,
    ...this.commentStricker,
  ];
  isHovered: any = false;
  hoveredName: any;
  hoveredSenderName: any;
  hoveredCurrentUser: any;
  hoveredRecipienUser: any;
  userservice = inject(UserService);
  dialog = inject(MatDialog);
  showStickerDiv: any;
  checkUpdateBackcolor: any;
  isiconShow: any;
  selectFiles: any[] = [];
  cdr = inject(ChangeDetectorRef);
  LogInAuth = inject(LoginAuthService);
  @Output() threadOpened = new EventEmitter<void>();
  private loginStatusSub: Subscription | undefined;
  private guestLoginStatusSub: Subscription | undefined;
  loginAuthService = inject(LoginAuthService);
  enterChatByUser: any;
  private subscriptions: Subscription[] = [];
  selection = inject(SelectionService)
  selectedUserSub: any;
  selectedChannselSub: any;

  ngAfterViewChecked() {
    this.cdr.detectChanges();
  }
  
  ngOnInit(): void {
    this.global.channelSelected = false;
    this.userId = this.route.snapshot.paramMap.get('id');
    this.user = this.userId;
    this.getcurrentUserById(this.userId);
    this.subscribeToProfileSelection();
    this.subscribeToWelcomeChannel();
    this.subscribeToLoginStatus();
    
    this.subscriptions.push(
      this.selection.selectedUser$.subscribe((user) => {
        this.selectedUser = user;
      })
    );

    this.subscriptions.push(
      this.selection.selectedChannel$.subscribe((channel) => {
        this.selectedChannel = channel;
      })
    );
  }

  ngOnDestroy(): void {
    if (this.loginStatusSub) {
      this.loginStatusSub.unsubscribe();
    }
    if (this.guestLoginStatusSub) {
      this.guestLoginStatusSub.unsubscribe();
    }
    if (this.welcomeChannelSubscription) {
      this.welcomeChannelSubscription.unsubscribe();
    }
    this.subscriptions.forEach((sub) => sub.unsubscribe());
  }

  private subscribeToProfileSelection(): void {
    this.userservice.profileSelection$.subscribe((profileType) => {
      if (profileType) {
        this.resetProfileSelection();
        this.checkProfileType();
        this.openMyProfile = true;
      } else {
        this.closeMyUserProfile();
      }
    });
  }

   subscribeToWelcomeChannel(): void {
    this.welcomeChannelSubscription = this.global.welcomeChannel$.subscribe(
      (welcomeChannelStatus) => {
        this.afterLoginSheet = welcomeChannelStatus;
      }
    );
  }

  subscribeToLoginStatus(): void {
    this.loginStatusSub = this.loginAuthService.loginSuccessful$.subscribe(
      (status) => {
        this.loginSuccessful = status;
      }
    );
  }

  subscribeToGuestLoginStatus(): void {
    this.guestLoginStatusSub = this.loginAuthService.isGuestLogin$.subscribe(
      (status) => {
        this.isGuestLogin = status;
      }
    );
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['selectedUser'] && this.selectedUser) {
      this.global.channelSelected = false;
      this.selectedChannel = null;
      this.onHeaderChannel = null;
      this.checkProfileType();
      this.global.clearCurrentChannel();
      this.afterLoginSheet = false;
    }

    if (changes['selectedChannel'] && this.selectedChannel) {
      this.selectedUser = null;
      this.onHeaderUser = null;
      this.fetchChannelMembers();
      this.global.channelSelected = true;
      this.global.setCurrentChannel(this.selectedChannel);
    }

    if (changes['onHeaderUser'] && this.onHeaderUser) {
      this.onHeaderChannel = null;
      this.global.channelSelected = false;
      this.selectedUser = this.onHeaderUser;
      this.checkProfileType();
      this.global.clearCurrentChannel();
      this.afterLoginSheet = false;
    }

    if (changes['onHeaderChannel'] && this.onHeaderChannel) {
      this.selectedUser = null;
      this.onHeaderUser = null;
      this.selectedChannel = this.onHeaderChannel;
      this.fetchChannelMembers();
      this.global.setCurrentChannel(this.onHeaderChannel);
    }
  }

  resetChannelMessages() {
    console.log(this.onHeaderChannel.messages);
    return (this.onHeaderChannel.messages = []);
  }

  onMessageForwarded(data: any) {
    this.messagesData.push(data);
  }

  updateSelectedUser(newUser: any) {
    this.selectedUser = newUser;
    this.cdr.detectChanges();
  }

  openDialog() {
    this.dialog.open(DialogEditChannelComponent, {
      data: this.selectedChannel,
      panelClass: 'edit-dialog',
      maxWidth: '872px',
      maxHeight: '616px',
    });
  }

  openMemberDialog() {
    this.dialog.open(DialogChannelUserComponent, {
      data: {
        members: this.selectedChannel.userIds,
        channel: this.selectedChannel,
      },
      panelClass: 'member-dialog',
      maxWidth: '415px',
      maxHeight: '411px',
    });
  }

  openAddMemberDialog() {
    this.dialog.open(DialogAddMemberComponent, {
      data: this.selectedChannel,
      panelClass: 'add-member-dialog',
      maxWidth: '514px',
      maxHeight: '320px',
    });
  }

  async fetchChannelMembers() {
    if (!this.selectedChannel?.id) {
      this.channelMembers = [];
      return;
    }

    try {
      const channelRef = doc(
        this.firestore,
        'channels',
        this.selectedChannel.id
      );
      onSnapshot(channelRef, async (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() as ChannelData;
          const userIds = data['userIds'];
          const membersPromises = userIds.map(async (userId: string) => {
            const userRef = doc(this.firestore, 'users', userId);
            const userSnap = await getDoc(userRef);
            if (userSnap.exists()) {
              return {
                id: userSnap.id,
                ...userSnap.data(),
              };
            }
            return null;
          });

          const members = await Promise.all(membersPromises);
          this.channelMembers = members.filter(
            (member: any) => member !== null
          );
          this.cdr.detectChanges();
        }
      });
    } catch (error) {
      console.error('Error fetching channel members:', error);
    }
  }

  async getcurrentUserById(userId: string) {
    try {
      const userRef = doc(this.firestore, 'users', userId);
      const userSnapshot = await getDoc(userRef);
      if (userSnapshot.exists()) {
        this.global.currentUserData = {
          id: userSnapshot.id,
          ...userSnapshot.data(),
        };
        this.userservice.observingUserChanges(userId, (updatedUser: User) => {
          this.selectedUser = updatedUser;
        });
      }
    } catch (error) {
      console.error('Fehler beim Abruf s Benutzers:', error);
    }
  }

  resetProfileSelection() {
    this.currentUserwasSelected = false;
    this.contactWasSelected = false;
  }

  showMyUserProfile() {
    this.resetProfileSelection();
    this.checkProfileType();
    this.openMyProfile = true;
    this.overlayStatusService.setOverlayStatus(this.openMyProfile);
  }

  checkProfileType() {
    if (this.selectedUser?.uid === this.userId) {
      this.currentUserwasSelected = true;
    } else {
      this.contactWasSelected = true;
    }
  }

  closeMyUserProfile() {
    this.openMyProfile = false;
    this.overlayStatusService.setOverlayStatus(false);
  }

  onThreadOpened() {
    this.threadOpened.emit();
  }
  

  
  enterByUsername(user: any, isChannel: boolean = false) {
    this.enterChatByUser = user;
    this.selectedUser = this.enterChatByUser;
    if (isChannel) {
      this.channelSelectedFromStartscreen.emit(user); 
      this.global.setCurrentChannel(user); 
    } else {
      this.userSelectedFromStartscreen.emit(user);
      this.global.clearCurrentChannel(); 
    }

    this.checkProfileType();
  }
}
