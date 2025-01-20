import {
  Firestore,
  Unsubscribe,
  collection,
  doc,
  getDoc,
  onSnapshot,
  updateDoc,
  setDoc,
} from '@angular/fire/firestore';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { DialogCreateChannelComponent } from '../dialog-create-channel/dialog-create-channel.component';
import { CommonModule } from '@angular/common';
import {
  Component,
  OnInit,
  inject,
  Output,
  EventEmitter,
  Input,
  SimpleChanges,
  ChangeDetectorRef,
  NgZone,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { GlobalVariableService } from '../services/global-variable.service';
import { UserService } from '../services/user.service';
import { User } from '../models/user.class';
import { Channel } from '../models/channel.class';
import { LoginAuthService } from '../services/login-auth.service';
import { Subscription } from 'rxjs';
import { SelectionService } from '../services/selection.service';

@Component({
  selector: 'app-workspace',
  standalone: true,
  imports: [CommonModule, MatDialogModule],
  templateUrl: './workspace.component.html',
  styleUrl: './workspace.component.scss',
})
export class WorkspaceComponent implements OnInit {
  selectedChannel: any = null;
  channelDrawerOpen: boolean = true;
  messageDrawerOpen: boolean = true;
  userId: any | null = null;
  route = inject(ActivatedRoute);
  firestore = inject(Firestore);
  userData: any = {};
  allUsers: any = [];
  allChannels: Channel[] = [];
  user: User = new User();
  unsub?: () => void;
  checkUsersExsists: boolean = false;
  userService = inject(UserService);
  @Output() userSelected = new EventEmitter<any>();
  @Output() channelSelected = new EventEmitter<Channel>();
  @Input() selectedUserHome: any;
  @Input() selectedChannelHome: any;
  readonly dialog = inject(MatDialog);
  selection = inject(SelectionService)
  private channelsUnsubscribe: Unsubscribe | undefined;
  logInAuth = inject(LoginAuthService);
  isGuestLogin = false;
  private guestLoginStatusSub: Subscription | undefined;
  clickedUsers: string[] = [];
  id: any;
  selectedUsers: any[] = [];
  messageCountsArr: any = {};
  selectedUser: any;

  constructor(
    public global: GlobalVariableService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone
  ) {}

  async ngOnInit(): Promise<void> {
    await this.getAllChannels();
    await this.getAllUsers();
    this.userId = this.route.snapshot.paramMap.get('id');
    if (this.userId) {
      this.getUserById(this.userId);
      this.getUserMessageCount(this.userId);
      this.userService.observingUserChanges(
        this.userId,
        (updatedUser: User) => {
          this.global.currentUserData.name = updatedUser.name;
        }
      );
    }
    await this.subscribeToGuestLoginStatus();
  }

  async subscribeToGuestLoginStatus(): Promise<void> {
    this.guestLoginStatusSub = this.logInAuth.isGuestLogin$.subscribe(
      (status) => {
        this.isGuestLogin = status;
      }
    );
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (
      changes['selectedUserHome'] &&
      !changes['selectedUserHome'].firstChange
    ) {
      this.selectedUser = this.selectedUserHome;
      this.userSelected.emit(this.selectedUser);
    }

    if (
      changes['selectedChannelHome'] &&
      !changes['selectedChannelHome'].firstChange
    ) {
      this.selectedChannel = this.selectedChannelHome;
      this.channelSelected.emit(this.selectedChannel);
    }
  }


selectUser(user: any) {
  this.userSelected.emit(user);
  this.id = user.id;
  this.global.directThreadSubject.next('');
  this.global.channelThreadSubject.next(null);
  const actuallyId = this.id;
  if (this.userId && this.messageCountsArr?.messageCount && this.messageCountsArr.messageCount[actuallyId] > 0) {
    const docRef = doc(this.firestore, 'messageCounts', this.userId);
    const resetMessageCount: any = {};
    resetMessageCount[`messageCount.${actuallyId}`] = 0;
    updateDoc(docRef, resetMessageCount);
  } 
   this.global.statusCheck =false;
   this.openvollWidtChannelOrUserBox();
   this.hiddenVoolThreadBox();
   this.checkWidtSize();
   this.cheackChatOpen();
}   

openvollWidtChannelOrUserBox() {
  if(window.innerWidth<=1900 && window.innerWidth > 1200){
    return this.global.checkWideChannelorUserBox=true;
  }else{
    return this.global.checkWideChannelorUserBox=false;
  }
}

  hiddenVoolThreadBox() {
    if (
      window.innerWidth <= 1900 &&
      window.innerWidth > 1200 &&
      this.global.checkWideChannelOrUserThreadBox
    ) {
      this.global.checkWideChannelOrUserThreadBox = false;
    }
  }

  cheackChatOpen() {
    if (window.innerWidth <= 1200 && this.global.openChannelOrUserThread) {
      this.global.openChannelOrUserThread = false;
    }
  }

  checkWidtSize() {
    if (window.innerWidth <= 1200) {
      return (this.global.openChannelorUserBox = true);
    } else {
      return (this.global.openChannelorUserBox = false);
    }
  }

  selectCurrentUser() {
    this.selectedChannel = null;
    this.selectedUser = this.global.currentUserData;
    this.userSelected.emit(this.global.currentUserData);
    this.global.statusCheck = true;
    this.checkWidtSize();
  }

  openDialog() {
    const dialogRef = this.dialog.open(DialogCreateChannelComponent, {
      data: {
        userId: this.userId,
      },
      height: '539px',
      width: '872px',
    });
    dialogRef.afterClosed().subscribe((result) => {
      this.getAllChannels();
    });
  }

  findWelcomeChannel() {
    const willkommenChannel = this.allChannels.find(
      (channel) => channel.name == 'Willkommen'
    );
    if (willkommenChannel) {
      this.global.channelSelected = false;
      this.selectChannel(willkommenChannel);
    }
  }

  ngOnDestroy(): void {
    if (this.channelsUnsubscribe) {
      this.channelsUnsubscribe();
    }
  }

  async getAllChannels() {
    const colRef = collection(this.firestore, 'channels');
    this.channelsUnsubscribe = onSnapshot(colRef, (snapshot) => {
      this.allChannels = snapshot.docs.map((doc) => new Channel(doc.data()));
      this.sortChannels();
      this.findWelcomeChannel();
    });
  }

  sortChannels() {
    this.allChannels.sort((a, b) => {
      if (a.name === 'Willkommen') return -1;
      if (b.name === 'Willkommen') return 1;
      return 0;
    });
  }

  getLocalStoragePhoto(uid: string): string | null {
    return localStorage.getItem(`userPhoto_${uid}`);
  }
  
  handleImageError(event: any) {
    event.target.src = '../../assets/img/avatar/avatar4.png'; // Your fallback image
  }

  async getUserById(userId: string) {
    const userDocref = doc(this.firestore, 'users', userId);
    onSnapshot(userDocref, (docSnapshot) => {
      if (docSnapshot.exists()) {
        const data = docSnapshot.data();
        const id = docSnapshot.id;
        this.global.currentUserData = { id: id, ...data };
      } else {
        this.global.currentUserData = {};
      }
    });
  }

  getUserMessageCount(userId: string) {
    const userDocRef = doc(this.firestore, 'messageCounts', userId);
    onSnapshot(userDocRef, (snapshot) => {
      if (snapshot.exists()) {
        this.messageCountsArr = { ...snapshot.data() };
      } else {
        this.messageCountsArr = {};
      }
    });
  }

  async getAllUsers() {
    const usersCollection = collection(this.firestore, 'users');
    onSnapshot(usersCollection, (snapshot) => {
      this.allUsers = [];
      snapshot.forEach((doc) => {
        this.checkUsersExsists = true;
        if (doc.id !== this.userId) {
          this.allUsers.push({ id: doc.id, ...doc.data() });
        }
      });
    });
  }

  async selectChannel(channel: any) {
    this.channelSelected.emit(channel);
    this.selectedUser = null;
    this.selectedChannel = channel;
    const isMember = await this.global.checkChannelMembership(
      channel,
      this.global.currentUserData.id
    );
    this.global.channelSelected = true;
    this.channelSelected.emit(channel);
    this.global.directThreadSubject.next('');
    this.global.channelThreadSubject.next(null);
    this.global.setCurrentChannel(channel);
    this.openvollWidtChannelOrUserBox();
    this.hiddenVoolThreadBox();
    this.checkWidtSize();
    this.cheackChatOpen();
    this.selection.setSelectedChannel(channel);
  }

  toggleChannelDrawer() {
    this.channelDrawerOpen = !this.channelDrawerOpen;
  }
  toggleMessageDrawer() {
    this.messageDrawerOpen = !this.messageDrawerOpen;
  }

  isUserChanged(userOrChannel: any, isChannel: boolean): boolean {
    if (isChannel) {
      return false;
    }
    return userOrChannel.id !== this.selectedUser?.id;
  }

  setUser(userOrChannel: any): void {
    this.selectedUser = userOrChannel;
    this.selectUser(this.selectedUser);
    const foundUser = this.allUsers.find(
      (user: { id: any }) => user.id === this.selectedUser.id
    );
    if (foundUser) {
      this.selectedUser = foundUser;
    }
  }

  setChannel(userOrChannel: any): void {
    this.selectedChannel = userOrChannel;
    this.selectChannel(this.selectedChannel);
  }

  enterByUsername(userOrChannel: any, isChannel: boolean = false) {
    if (isChannel && (!userOrChannel || !userOrChannel.name)) {
      console.warn('Invalid channel passed to enterByUsername. Aborting.');
      return;
    }
    this.selectedChannel = isChannel ? userOrChannel : null;
    if (this.isUserChanged(userOrChannel, isChannel)) {
      this.setUser(userOrChannel);
    }
    if (isChannel) {
      this.setChannel(userOrChannel);
    }
  }
}
