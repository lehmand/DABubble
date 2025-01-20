import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  inject,
  Input,
  OnInit,
  Output,
  ViewChild,
} from '@angular/core';
import { GlobalVariableService } from '../services/global-variable.service';
import { User } from '../models/user.class';
import {
  collection,
  doc,
  Firestore,
  getDoc,
  onSnapshot,
  query,
  updateDoc,
  addDoc,
  orderBy,
  setDoc,
  deleteDoc,
  QuerySnapshot,
} from '@angular/fire/firestore';
import { UserService } from '../services/user.service';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { PickerComponent } from '@ctrl/ngx-emoji-mart';
import { OverlayStatusService } from '../services/overlay-status.service';
import { firstValueFrom, Subscription } from 'rxjs';
import { InputFieldComponent } from '../input-field/input-field.component';
import { ThreadControlService } from '../services/thread-control.service';
import { Emoji } from '@ctrl/ngx-emoji-mart/ngx-emoji';
import { currentThreadMessage } from '../models/threadMessage.class';
import { MatCardModule } from '@angular/material/card';
import { FormsModule } from '@angular/forms';
import { DirectThreadInputComponent } from '../direct-thread-input/direct-thread-input.component';

import {
  animate,
  style,
  transition,
  trigger,
} from '@angular/animations';
import { MentionMessageBoxComponent } from '../mention-message-box/mention-message-box.component';
import { getAuth } from '@angular/fire/auth';



@Component({
  selector: 'app-direct-thread',
  standalone: true,
  imports: [
    CommonModule,
    PickerComponent,
    InputFieldComponent,
    FormsModule,
    MatCardModule,
    MentionMessageBoxComponent,
    DirectThreadInputComponent
  ],
  templateUrl: './direct-thread.component.html',
  styleUrls: ['./direct-thread.component.scss'],
  animations: [
    trigger('fadeIn', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('300ms ease-in-out', style({ opacity: 1 })),
      ]),
    ]),
    trigger('slideIn', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateX(-50%)' }),
        animate(
          '150ms ease-in-out',
          style({ opacity: 1, transform: 'translateX(0)' })
        ),
      ]),
      transition(':leave', [
        style({ opacity: 1, transform: 'translateX(0)' }),
        animate(
          '150ms ease-in-out',
          style({ opacity: 0, transform: 'translateX(-50%)' })
        ),
      ]),
    ]),
  ],
})
export class DirectThreadComponent implements OnInit {
  @Output() userSelectedFromDirectThread = new EventEmitter<any>();
  @Output() closeDirectThread = new EventEmitter<void>();
  @Input() selectedUser: any;
  @ViewChild('messageContainer') messageContainer!: ElementRef;
  global = inject(GlobalVariableService);
  firestore = inject(Firestore);
  userService = inject(UserService);
  overlayStatusService = inject(OverlayStatusService);
  threadControlService = inject(ThreadControlService);
  chatMessage: string = '';
  showUserBubble: boolean = false;
  currentUser: User = new User();
  userID: any | null = null;
  messagesData: any[] = [];
  showOptionBar: { [key: string]: boolean } = {};
  isHovered = false;
  isEmojiPickerVisible = false;
  isEmojiPickerEditVisible = false;
  currentSrc?: string;
  icons: { [key: string]: string } = {
    iconMore: 'assets/img/more_vertical.svg',
    iconAddReaction: 'assets/img/comment/add_reaction.svg',
    iconThird: 'assets/img/third.svg',
  };
  isDirectThreadOpen: boolean = true;
  reactions: { [messageId: string]: any[] } = {};
  selectFiles: any[] = [];
  subscription = new Subscription();
  shouldScrollToBottom = false;
  firstInitialisedThreadMsg: string | null = null;
  currentThreadMessage!: currentThreadMessage;
  showReactionPopUpSender: { [key: string]: boolean } = {};
  showReactionPopUpRecipient: { [key: string]: boolean } = {};
  showReactionPopUpBoth: { [key: string]: boolean } = {};
  firstThreadValue: string | null = null;
  currentUserId: string | null = null;
  lastMessageId: string | null = '0';
  editMessageId: string | null = null;
  editableTextarea!: ElementRef<HTMLTextAreaElement>;
  isFirstClick: boolean = true;
  editableMessageText: string = '';
  scrollHeightInput: any;
  editWasClicked = false;
  showEditOption: boolean = true;
  hoveredReactionIcon: boolean = false;
  wasClickedInDirectThread = false;
  getAllUsersName: any[] = [];
  topicMessage: any;
  directMessageId: any;
  messages: any[] = [];
  showTopicBar: boolean = true;
  showAnswerBar: string | null = null;
  showEditDialog: string | null = null;
  editTopicMode: boolean = false;
  editableTopicText: string = '';
  debugReactionBar: boolean = true;
  currentUserLastEmojis: string[] = [];
  debugReactionInfo: boolean = true;

  constructor(private route: ActivatedRoute, private cdr: ChangeDetectorRef) {}
  async ngOnInit(): Promise<void> {
    this.global.directThread$.subscribe((threadId) => {
      if (threadId) {
        this.directMessageId = threadId;
        this.getTopic();
        this.getAllUsersname();
        this.loadThreadMessages();
        this.loadCurrentUserEmojis();
      }
    });
    this.currentUserId = this.route.snapshot.paramMap.get('id');
  }

  async getTopic() {
    return new Promise<void>((resolve) => {
      const docRef = doc(this.firestore, 'messages', this.directMessageId);
      onSnapshot(docRef, (doc) => {
        const data = doc.data();
        if (data) {
          if (data['timestamp']?.seconds) {
            data['timestamp'] = new Date(data['timestamp'].seconds * 1000);
          }
          this.topicMessage = { ...data, id: this.directMessageId };
          resolve();
        }
      });
    });
  }

  async loadCurrentUserEmojis() {
      const auth = getAuth();
      const currentUserId = auth.currentUser?.uid;
  
      if (currentUserId) {
        const userDocRef = doc(this.firestore, 'users', currentUserId);
  
        onSnapshot(userDocRef, (docSnapshot) => {
          const userData = docSnapshot.data();
          if (userData?.['lastEmojis']) {
            this.currentUserLastEmojis = userData['lastEmojis'];
          }
        });
      } else {
        console.warn('No current user logged in');
      }
    }

  async loadThreadMessages() {
    if (!this.directMessageId) {
      console.log('No message selected!');
      return;
    }
    const messageRef = collection(
      this.firestore,
      'messages',
      this.directMessageId,
      'threadMessages'
    );

    const q = query(messageRef, orderBy('timestamp', 'asc'));
    onSnapshot(q, (querySnapshot: any) => {
      this.messages = querySnapshot.docs.map((doc: any) => {
        const data = doc.data();
        if (data.timestamp && data.timestamp.seconds) {
          data.timestamp = new Date(data.timestamp.seconds * 1000);
        }
        return { id: doc.id, ...data };
      });
    });
    console.log(this.messages)
  }

  toggleEditOption(messageId: string) {
    this.showEditDialog = this.showEditDialog === messageId ? null : messageId;
  }

  enableEditTopic(): void {
    this.editTopicMode = true;
    this.editableTopicText = this.topicMessage.text;
  }

  cancelTopicEdit(): void {
    this.editTopicMode = false;
    this.editableTopicText = '';
  }

  async saveTopicEdit(): Promise<void> {
    try {
      if (!this.editableTopicText.trim()) {
        console.error('Topic text cannot be empty');
        return;
      }
      const docRef = doc(this.firestore, 'messages', this.directMessageId);
      await updateDoc(docRef, { 
        text: this.editableTopicText,
        editedTextShow: true,
       });
      this.topicMessage.text = this.editableTopicText; // Update the local view
      this.editTopicMode = false; // Exit edit mode
    } catch (error) {
      console.error('Error saving the topic edit:', error);
    }
  }

  editMessages(message: any) {
    this.editWasClicked = true;
    this.editMessageId = message.id;
    this.editableMessageText = message.text;
    if (this.isFirstClick) {
      setTimeout(() => {
        if (this.editableTextarea) {
          const textarea = this.editableTextarea.nativeElement;
          textarea.scrollTop = textarea.scrollHeight;
          textarea.focus();
        }
      }, 20);
      this.isFirstClick = false;
    }
  }

  selectUserForChat(user: any) {
    this.userSelectedFromDirectThread.emit(user);
  }

  async handleMentionClick(mention: string) {
    this.wasClickedInDirectThread = true;
    const cleanName = mention.substring(1);
    const userRef = collection(this.firestore, 'users');
    onSnapshot(userRef, (querySnapshot) => {
      this.global.getUserByName = {};
      querySnapshot.forEach((doc) => {
        const dataUser = doc.data();
        const dataUserName = dataUser['name'];
        if (dataUserName === cleanName) {
          this.global.getUserByName = { id: doc.id, ...dataUser };
        }
        this.global.openMentionMessageBox = true;
      });
    });
  }

  closeMentionBoxHandler() {
    this.wasClickedInDirectThread = false;
  }

  splitMessage(text: string) {
    const regex = /(@[\w\-_!$*]+(?:\s[\w\-_!$*]+)?)/g;
    return text.split(regex);
  }

  isMention(part: string): boolean {
    if (!part.startsWith('@')) {
      return false;
    }
    const mentionName = part.substring(1);
    return this.getAllUsersName.some((user) => user.userName === mentionName);
  }

  async getAllUsersname() {
    const userRef = collection(this.firestore, 'users');
    onSnapshot(userRef, (querySnapshot) => {
      this.getAllUsersName = [];
      querySnapshot.forEach((doc) => {
        const dataUser = doc.data();
        const userName = dataUser['name'];
        this.getAllUsersName.push({ userName });
      });
    });
  }

  cancelEdit() {
    this.editMessageId = null;
    this.editableMessageText = '';
    this.editWasClicked = false;
    this.isFirstClick = true;
  }

  onCancelMessageBox(): void {
    this.wasClickedInDirectThread = false;
  }

  async saveOrDeleteMessage(message: any) {
    try {
      if (!message || !message.id) {
        console.error('Invalid message object passed to saveOrDeleteMessage');
        return;
      }
      const messageRef = doc(
        this.firestore,
        `messages/${this.directMessageId}/threadMessages/${message.id}`
      );
      if (!this.editableMessageText || this.editableMessageText.trim() === '') {
        await deleteDoc(messageRef);
      } else {
        const editMessage = {
          text: this.editableMessageText,
          editedTextShow: true,
        };
        await updateDoc(messageRef, editMessage);
      }
      this.resetEditMode();
    } catch (error) {
      console.error('Error in saveOrDeleteMessage:', error);
    }
  }

  resetEditMode() {
    this.editMessageId = null;
    this.editableMessageText = '';
    this.isFirstClick = true;
    this.editWasClicked = false;
    this.showOptionBar = {};
  }

  onInput(event: Event): void {
    const textarea = event.target as HTMLTextAreaElement;
    const height = (textarea.scrollTop = textarea.scrollHeight);
    this.scrollHeightInput = height;
  }

  formatDate(date: Date): string {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
  }

  async initializeLastMessageId(): Promise<void> {
    try {
      await this.threadControlService.initializeLastMessageId(
        this.global.directThreadSubject.value
      );
    } catch (error) {
      console.error('fehler beim Initialisieren der lastMessageId:', error);
    }
  }

  scrollToLastMessage(messageId: string): void {
    const interval = setInterval(() => {
      const element = document.getElementById(messageId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
        clearInterval(interval);
      }
    }, 100);
  }

  toggleOptionBar(messageId: string, show: boolean): void {
    if (this.editWasClicked && this.editMessageId !== messageId) {
      return;
    }
    this.showOptionBar[messageId] = show;
  }

  toggleReactionInfoSender(messageId: string, status: boolean): void {
    this.showReactionPopUpSender[messageId] = status;
  }
  toggleReactionInfoRecipient(messageId: string, status: boolean): void {
    this.showReactionPopUpRecipient[messageId] = status;
  }

  toggleBothReactionInfo(messageId: string, show: boolean): void {
    this.showReactionPopUpBoth[messageId] = show;
  }

  getUserIds(reactions: {
    [key: string]: { emoji: string; counter: number };
  }): string[] {
    return Object.keys(reactions);
  }

  ngOnDestroy(): void {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  async loadCurrentUser(userID: string) {
    try {
      const userResult = await this.userService.getUser(userID);
      if (userResult) {
        this.currentUser = userResult;
      }
    } catch (error) {
      console.error('Fehler beim Laden des Benutzers:', error);
    }
  }

  toggleThreadStatus(status: boolean) {
    this.isDirectThreadOpen = status;
  }

  async handleFirstThreadMessageAndPush(firstInitialisedThreadMsg: any) {
    try {
      const docRef = doc(this.firestore, 'messages', firstInitialisedThreadMsg);
      const docSnapshot = await getDoc(docRef);
      if (docSnapshot.exists()) {
        const docData = docSnapshot.data();
        if (docData?.['firstMessageCreated']) {
          this.currentThreadMessage = {
            id: docSnapshot.id,
            ...docData,
          };
          return;
        }
      }
      await setDoc(docRef, { firstMessageCreated: true }, { merge: true });
      this.currentThreadMessage = {
        id: docSnapshot.id,
        ...docSnapshot.data(),
      };
      const threadMessagesRef = collection(
        this.firestore,
        `messages/${firstInitialisedThreadMsg}/threadMessages`
      );
      await this.settingDataforFireBase(
        threadMessagesRef,
        this.currentThreadMessage
      );
    } catch (error) {
      console.error('Fehler der Thread-Nachricht:', error);
    }
  }

  async settingDataforFireBase(threadMessagesRef: any, threadMessageData: any) {
    try {
      /*       if (
        !this.selectedUser ||
        !this.selectedUser.uid ||
        !this.global.currentUserData
      ) {
        throw new Error(
          `Ungültige Daten: selectedUser = ${JSON.stringify(
            this.selectedUser
          )}, currentUserData = ${JSON.stringify(this.global.currentUserData)}`
        );
      } */
      const messageData = {
        senderId: threadMessageData.senderId,
        senderName: threadMessageData.senderName,
        senderPicture: threadMessageData.senderPicture || '',
        timestamp: new Date(),
        selectedFiles: this.selectFiles || [],
        editedTextShow: false,
        recipientId: threadMessageData.recipientId,
        recipientName: threadMessageData.recipientName,
        recipientStickerCount: 0,
        recipientSticker: '',
        text: this.currentThreadMessage?.text || '',
        firstMessageCreated: true,
        reactions: '',
      };

      const docRef = await addDoc(threadMessagesRef, messageData);
      console.log('Erstellte Nachricht-ID:', docRef.id);
      this.threadControlService.setLastMessageId(docRef.id);
    } catch (error) {
      console.error('Fehler beim Hinzufügen der Nachricht:', error);
    }
  }

  openEmojiPicker() {
    this.isEmojiPickerVisible = true;
    this.overlayStatusService.setOverlayStatus(true);
  }

  closePicker() {
    this.overlayStatusService.setOverlayStatus(false);
    this.isEmojiPickerVisible = false;
  }

  closePickerEdit() {
    this.overlayStatusService.setOverlayStatus(false);
    this.isEmojiPickerEditVisible = false;
  }

  openEmojiPickerEditMode() {
    this.isEmojiPickerEditVisible = true;
    this.overlayStatusService.setOverlayStatus(true);
  }

  addEmojiToEdit(event: any, target: 'topic' | 'message'): void {
    if (event && event.emoji && event.emoji.native) {
      const emoji = event.emoji.native;
  
      if (target === 'topic') {
        this.editableTopicText = (this.editableTopicText || '') + emoji;
      } else if (target === 'message') {
        this.editableMessageText = (this.editableMessageText || '') + emoji;
      }
    } else {
      console.error('No emoji selected');
    }
  }

  async getThreadMessageRef(currentMessageId: string): Promise<any> {
    console.log(currentMessageId);
  
    const topicMessageRef = doc(this.firestore, 'messages', currentMessageId);
    const threadMessageRef = doc(
      this.firestore,
      'messages',
      this.directMessageId,
      'threadMessages',
      currentMessageId
    );
  
    const topicDocSnapshot = await getDoc(topicMessageRef);
    if (topicDocSnapshot.exists()) {
      return topicMessageRef;
    }
    const threadDocSnapshot = await getDoc(threadMessageRef);
    if (threadDocSnapshot.exists()) {
      return threadMessageRef;
    }
  
    console.error('No valid document reference found for the given ID.');
    return null;
  }
  

  async getThreadMessageDoc(threadMessageRef: any): Promise<any> {
    const threadMessageDoc = await getDoc(threadMessageRef);
    if (!threadMessageDoc.exists()) {
      console.error('thread message nicht gefunden.');
      return null;
    }
    return threadMessageDoc.data();
  }

  async handleLastEmojiClick(emoji: string, messageId: string, userId: string) {
    try {
      const threadMessageRef = await this.getThreadMessageRef(messageId);
      const threadMessageData = await this.getThreadMessageDoc(threadMessageRef);
      if (!threadMessageData) return;
  
      if (!threadMessageData['reactions']) {
        threadMessageData['reactions'] = {};
      }
  

      const existingReaction = threadMessageData['reactions'][userId];
      if (existingReaction) {
        if (existingReaction.emoji === emoji) {
          threadMessageData['reactions'][userId].counter = 
            existingReaction.counter === 0 ? 1 : 0;
        } else {
          threadMessageData['reactions'][userId] = {
            emoji: emoji,
            counter: 1
          };
        }
      } else {
        threadMessageData['reactions'][userId] = {
          emoji: emoji,
          counter: 1
        };
      }

      await updateDoc(threadMessageRef, {
        reactions: threadMessageData['reactions']
      });
    } catch (error) {
      console.error('Error handling emoji click:', error);
    }
  }

  async addEmoji(event: any, messageId: string, userId: string) {
    try {
      const emoji = event.emoji.native;
      await this.handleLastEmojiClick(emoji, messageId, userId);
    } catch (error) {
      console.error('Error adding emoji reaction:', error);
    }
  }
  

  TwoReactionsTwoEmojis(recipientId: any, senderId: any): boolean {
    if (recipientId?.counter > 0 && senderId?.counter > 0) {
      return true;
    }
    if (!recipientId?.counter || !senderId?.counter) {
      return false;
    }
    return false;
  }

  getSenderReaction(reactions: any): any | null {
    const reactionsArray = Array.isArray(reactions)
      ? reactions
      : Object.values(reactions || {});
    return (
      reactionsArray.find(
        (reaction) => reaction.senderId === this.currentUser.uid
      ) || null
    );
  }

  getRecipientReaction(reactions: any): any | null {
    const reactionsArray = Array.isArray(reactions)
      ? reactions
      : Object.values(reactions || {});
    return (
      reactionsArray.find(
        (reaction) => reaction.recipientId === this.currentUser.uid
      ) || null
    );
  }

  areEmojisSame(reactions: any): boolean {
    const userIds = this.getUserIds(reactions);
    if (userIds.length < 2) return false;
    const firstEmoji = reactions[userIds[0]]?.emoji;
    const secondEmoji = reactions[userIds[1]]?.emoji;
    return firstEmoji === secondEmoji;
  }

  getEmojiFromFirstUser(reactions: any): string | null {
    const userIds = this.getUserIds(reactions);
    return userIds.length > 0 ? reactions[userIds[0]]?.emoji : null;
  }

  getTotalCounterForSameEmoji(reactions: any): number {
    if (!reactions) return 0;
    const userIds = this.getUserIds(reactions);
    if (userIds.length < 2) return 0;
    const firstEmoji = reactions[userIds[0]]?.emoji;
    return userIds.reduce((total, userId) => {
      if (reactions[userId]?.emoji === firstEmoji) {
        return total + (reactions[userId]?.counter || 0);
      }
      return total;
    }, 0);
  }

  async handlingExistingUserReaction(
    threadMessageId: string,
    userId: string,
    emoji: Emoji
  ) {
    const userReaction = this.reactions[threadMessageId].find((reaction) =>
      reaction.userIds.includes(userId)
    );
    if (userReaction) {
      userReaction.count--;
      userReaction.userIds = userReaction.userIds.filter(
        (id: string) => id !== userId
      );
    } else {
      const newReaction = {
        emoji,
        count: 1,
        userIds: [userId],
      };
      this.reactions[threadMessageId].push(newReaction);
    }
  }

  async updateMessageInDatabase(
    parentMessageId: string,
    threadMessageId: string,
    userId: string,
    emoji: string
  ) {
    try {
      const emojiDocRef = doc(
        this.firestore,
        `messages/${parentMessageId}/threadMessages/${threadMessageId}`
      );
      const docSnapshot = await getDoc(emojiDocRef);
      if (docSnapshot.exists()) {
        const currentData = docSnapshot.data();
        const reactions = currentData?.['reactions'] || {};
        if (!reactions[userId]) {
          reactions[userId] = { emoji: null, counter: 0 };
        }
        const otherUserId = Object.keys(reactions).find(
          (id) => id !== userId && reactions[id]?.emoji === emoji
        );
        if (otherUserId) {
          reactions[userId].emoji = emoji;
          reactions[userId].counter = 2;
        } else {
          reactions[userId].emoji = emoji;
          reactions[userId].counter = 1;
        }
        await updateDoc(emojiDocRef, {
          reactions: reactions,
        });
      }
    } catch (error) {
      console.error('fehler beim Aktualisieren der Reaktionen:', error);
    }
  }

  onMouseEnter(message: any) {
    message.isHovered = true;
  }

  onMouseLeave(message: any) {
    message.isHovered = false;
  }

  onClose() {
    this.toggleThreadStatus(false);
    this.closeDirectThread.emit();
    this.global.directThreadSubject.next(null);
    this.closeThreadVollWidth();
    this.closeThreadResponsive();
  }

  closeThreadResponsive(): void {
    if (window.innerWidth <= 1200 && this.global.openChannelOrUserThread) {
      this.global.openChannelOrUserThread = false;
      this.global.openChannelorUserBox = true;
    }
    } 
  
   closeThreadVollWidth(){
    if(window.innerWidth<=1900 && window.innerWidth>1200 && this.global.checkWideChannelOrUserThreadBox){
      this.global.checkWideChannelOrUserThreadBox=false;
      this.global.checkWideChannelorUserBox=true;
    }
   }  

   
  deleteFile(index: number) {
    this.global.selectThreadFiles.splice(index, 1);
  } 
}
