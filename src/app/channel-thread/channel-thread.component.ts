import {
  Component,
  ElementRef,
  EventEmitter,
  inject,
  Input,
  OnInit,
  Output,
  ViewChild,
} from '@angular/core';
import {
  collection,
  doc,
  DocumentReference,
  Firestore,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from '@angular/fire/firestore';
import { GlobalVariableService } from '../services/global-variable.service';
import { AuthService } from '../services/auth.service';
import { CommonModule } from '@angular/common';
import { InputFieldComponent } from '../input-field/input-field.component';
import { PickerComponent } from '@ctrl/ngx-emoji-mart';
import { getAuth } from '@angular/fire/auth';
import { FormsModule } from '@angular/forms';
import { OverlayStatusService } from '../services/overlay-status.service';
import { animate, style, transition, trigger } from '@angular/animations';
import { MentionMessageBoxComponent } from '../mention-message-box/mention-message-box.component';
import { ChannelThreadInputComponent } from "../channel-thread-input/channel-thread-input.component";

interface Message {
  id: string;
  senderId: string;
  text: string;
  timestamp: Date;
  senderName: string;
  senderPicture: string;
  selectedFiles:any[]
  reactions: { [emoji: string]: string[] };
  isEdited: boolean;
}

@Component({
  selector: 'app-channel-thread',
  standalone: true,
  imports: [
    CommonModule,
    InputFieldComponent,
    PickerComponent,
    FormsModule,
    MentionMessageBoxComponent,
    ChannelThreadInputComponent
],
  templateUrl: './channel-thread.component.html',
  styleUrl: './channel-thread.component.scss',
  animations: [
    trigger('slideIn', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateX(-50%)' }),
        animate(
          '150ms ease-in-out',
          style({ opacity: 100, transform: 'translateX(0)' })
        ),
      ]),
      transition(':enter', [
        style({ opacity: 100, transform: 'translateX(0)' }),
        animate(
          '150ms ease-in-out',
          style({ opacity: 0, transform: 'translateX(-50%)' })
        ),
      ]),
    ]),
  ],
})
export class ChannelThreadComponent implements OnInit {
  channelMessageId: any;
  @Input() selectedChannel: any;
  db = inject(Firestore);
  global = inject(GlobalVariableService);
  auth = inject(AuthService);
  overlay = inject(OverlayStatusService);
  topicMessage: Message | null = null;
  messages: Message[] = [];
  isChannelThreadOpen: boolean = false;
  isPickerVisible: string | null = null;
  showEditDialog: string | null = null;
  showEditArea: string | null = null;
  hoveredMessageId: string | null = null;
  hoveredTopic: boolean = false;
  currentUserLastEmojis: string[] = [];
  hoveredReactionMessageId: string | null = null;
  hoveredEmoji: string | null = null;
  editingMessageId: string | null = null;
  reactionUserNames: { [userId: string]: string } = {};
  messageToEdit: string = '';
  unsubscribe: (() => void) | undefined;
  @Output() userSelectedFromChannelThread = new EventEmitter<any>();
  @Output() userSelectedFromMentionMessagebox = new EventEmitter<any>();
  @Output() enterChatUser = new EventEmitter<any>();
  wasClickedInChannelThread = false;
  getAllUsersName: any[] = [];
  shouldScrollDown = true;
  @ViewChild('scrollContainer') private scrollContainer!: ElementRef;

  constructor() {}

  async ngOnInit(): Promise<void> {
    this.global.channelThread$.subscribe((threadId) => {
      if (threadId) {
        this.channelMessageId = threadId;
        this.getTopic();
        this.loadThreadMessages();
        this.toggleChannelThread(true);
        this.loadCurrentUserEmojis();
        this.getAllUsersname();
      }
    });
  }

  ngAfterViewInit(): void {
    this.scrollToBottom();
  }

  scrollToBottom(): void {
    if(this.shouldScrollDown){
      try {
        this.scrollContainer.nativeElement.scrollTop =
          this.scrollContainer.nativeElement.scrollHeight;
      } catch (err) {
        console.warn('Could not scroll to bottom:', err);
      }
    }
  }
  onMessageSent() {
    setTimeout(() => {
      this.scrollToBottom();
    }, 250);
  }

  async getAllUsersname() {
    const userRef = collection(this.db, 'users');
    onSnapshot(userRef, (querySnapshot) => {
      this.getAllUsersName = [];
      querySnapshot.forEach((doc) => {
        const dataUser = doc.data();
        const userName = dataUser['name'];
        this.getAllUsersName.push({ userName });
      });
    });
  }

  splitMessage(text: string) {
    const regex = /(@[\w\-_!$*]+(?:\s[\w\-_!$*]+)?)/g;
    return text?.split(regex);
  }

  isMention(part: string): boolean {
    if (!part.startsWith('@')) {
      return false;
    }
    const mentionName = part.substring(1);
    return this.getAllUsersName.some((user) => user.userName === mentionName);
  }

  async handleMentionClick(mention: string) {
    this.wasClickedInChannelThread = true;
    const cleanName = mention.substring(1);
    const userRef = collection(this.db, 'users');
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
    this.wasClickedInChannelThread = false;
  }


  selectUserForChat(user: any) {
    this.userSelectedFromChannelThread.emit(user);
  }

  onCancelMessageBox(): void {
    this.wasClickedInChannelThread = false;
  }

  enterChatByUserName(user: any) {
    this.enterChatUser.emit(user);
    this.wasClickedInChannelThread = false;
  }

  onMentionMessageboxClick(user: any) {
    this.userSelectedFromMentionMessagebox.emit(user);
  }

  toggleChannelThread(status: boolean) {
    this.isChannelThreadOpen = status;
  }

  async getTopic() {
    return new Promise<void>((resolve) => {
      const docRef = doc(
        this.db,
        'channels',
        this.selectedChannel.id,
        'messages',
        this.channelMessageId
      );
      onSnapshot(docRef, (doc) => {
        const data = doc.data();
        if (data) {
          if (data['timestamp']?.seconds) {
            data['timestamp'] = new Date(data['timestamp'].seconds * 1000);
          }
          this.topicMessage = { ...data, id: this.channelMessageId } as Message;
          resolve();
        }
      });
    });
  }

  async loadThreadMessages() {
    if (!this.channelMessageId) {
      console.log('No message selected!');
      return;
    }
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    const messagesRef = collection(
      this.db,
      'channels',
      this.selectedChannel.id,
      'messages',
      this.channelMessageId,
      'thread'
    );

    const q = query(messagesRef, orderBy('timestamp', 'asc'));
    onSnapshot(q, (querySnapshot: any) => {
      this.messages = querySnapshot.docs.map((doc: any) => {
        const data = doc.data();
        if (data.timestamp && data.timestamp.seconds) {
          data.timestamp = new Date(data.timestamp.seconds * 1000);
        }
        return { id: doc.id, ...data };
      });
    });
    setTimeout(() => {
      this.scrollToBottom();
    }, 250);
  }

  closeThread() {
    this.global.channelThreadSubject.next(null);
    this.closeThreadResponsive();
    this.hiddenThreadFullBox();
    this.checkResponsiveWidtSize();
  }  

  

  hiddenThreadFullBox(){
    if(window.innerWidth<=1900 && window.innerWidth > 1200 &&  this.global.checkWideChannelOrUserThreadBox){
      this.global.checkWideChannelOrUserThreadBox=false;
      this.global.checkWideChannelorUserBox=true;
    }
  }
  checkResponsiveWidtSize(){
    if(window.innerWidth<=1200 && this.global.openChannelOrUserThread)
      this.global.openChannelOrUserThread=false
      this.global.openChannelorUserBox=true
  }  

  closeThreadResponsive():void{
    if(window.innerWidth<=1200 && this.global.openChannelOrUserThread){
      this.global.openChannelOrUserThread=false;
      this.global.openChannelorUserBox=true;
    }
    } 


  async addLastUsedEmoji(emoji: any) {
    const auth = getAuth();
    const currentUserId = auth.currentUser?.uid;
  
    if (!currentUserId) {
      console.warn('No current user logged in');
      return;
    }
  
    const emojiNative = typeof emoji === 'string' ? emoji : emoji?.native;
  
    if (!emojiNative) {
      console.error('Invalid emoji provided:', emoji);
      return;
    }
  
    const docRef = doc(this.db, 'users', currentUserId);
  
    try {
      const existingEmojis = await this.getExistingEmojis(docRef);
  
      if (!Array.isArray(existingEmojis)) {
        console.warn('Unexpected data for last emojis:', existingEmojis);
        return;
      }
  
      const updatedEmojis = [emojiNative, ...existingEmojis].slice(0, 2);
  
      if (updatedEmojis.every((e) => typeof e === 'string')) {
        await updateDoc(docRef, { lastEmojis: updatedEmojis });
        console.log('Last emojis updated successfully:', updatedEmojis);
      } else {
        console.error('Invalid emojis array:', updatedEmojis);
      }
    } catch (error) {
      console.error('Error updating last emojis:', error);
    }
  }

  

  async getExistingEmojis(userDocRef: DocumentReference): Promise<string[]> {
    const userDoc = await getDoc(userDocRef);
    const userData = userDoc.data();
    return userData?.['lastEmojis'] || [];
  }

  togglePicker(messageId: string, isEditing: boolean = false) {
    this.isPickerVisible =
    this.isPickerVisible === messageId ? null : messageId;
    this.editingMessageId = isEditing ? messageId : null; // Track editing mode
    this.overlay.setOverlayStatus(true);
  }

  closePicker() {
    this.overlay.setOverlayStatus(false);
    this.isPickerVisible = null;
    this.editingMessageId = null;
  }

  

  hasReactions(reactions: { [emoji: string]: string[] }): boolean {
    return reactions && Object.keys(reactions).length > 0;
  }

  async loadCurrentUserEmojis() {
    const auth = getAuth();
    const currentUserId = auth.currentUser?.uid;

    if (currentUserId) {
      const userDocRef = doc(this.db, 'users', currentUserId);

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

  async addEmojiToMessage(emoji: string, messageId: string) {
    const auth = getAuth();
    const currentUserId = auth.currentUser?.uid;

    if (this.editingMessageId === messageId) {
      this.messageToEdit += emoji;
    } else if (currentUserId) {
      const messageDocRef =
        messageId === this.topicMessage?.id
          ? doc(
              this.db,
              'channels',
              this.selectedChannel.id,
              'messages',
              messageId
            )
          : doc(
              this.db,
              'channels',
              this.selectedChannel.id,
              'messages',
              this.channelMessageId,
              'thread',
              messageId
            );

      this.addLastUsedEmoji(emoji)

      getDoc(messageDocRef).then((messageSnapshot) => {
        const messageData = messageSnapshot.data();
        const reactions = messageData?.['reactions'] || {};

        let oldReaction: string | null = null;
        for (const [reactionEmoji, userIds] of Object.entries(reactions)) {
          if ((userIds as string[]).includes(currentUserId)) {
            oldReaction = reactionEmoji;
            break;
          }
        }

        if (oldReaction === emoji) {
          reactions[emoji] = reactions[emoji].filter(
            (userId: string) => userId !== currentUserId
          );
          if (reactions[emoji].length === 0) {
            delete reactions[emoji];
            this.hoveredReactionMessageId = null;
          }
        } else {
          if (oldReaction) {
            reactions[oldReaction] = reactions[oldReaction].filter(
              (userId: string) => userId !== currentUserId
            );
            if (reactions[oldReaction].length === 0) {
              delete reactions[oldReaction];
            }
          }

          if (!reactions[emoji]) {
            reactions[emoji] = [];
          }
          reactions[emoji].push(currentUserId);
        }

        updateDoc(messageDocRef, { reactions });
      });
    }
    this.closePicker(); 
  }   
   
   onReactionHover(message: Message, emoji: string) {
    this.hoveredReactionMessageId = message.id;
    this.hoveredEmoji = emoji;

    const auth = getAuth();
    const reactors = message.reactions[emoji] || [];
    const unknownUsers = reactors
      .filter((userId) => userId !== auth.currentUser?.uid)
      .filter((userId) => !this.reactionUserNames[userId]);

    if (unknownUsers.length > 0) {
      Promise.all(
        unknownUsers.map(async (userId) => {
          const userDoc = await getDoc(doc(this.db, 'users', userId));
          const userData = userDoc.data();
          if (userData?.['name']) {
            this.reactionUserNames[userId] = userData['name'];
          }
        })
      );
    }
  }

  getReactionText(message: Message, emoji: string | null): string {
    if (!emoji || !message.reactions) return '';

    const auth = getAuth();
    const currentUserId = auth.currentUser?.uid || '';
    const reactors = message.reactions[emoji] || [];

    if (reactors.length === 0) return '';

    const currentUserReacted = reactors.includes(currentUserId);
    const otherReactors = reactors.filter((userId) => userId !== currentUserId);

    if (currentUserReacted && reactors.length === 1) {
      return 'Du hast reagiert.';
    }

    if (currentUserReacted && otherReactors.length > 0) {
      const otherUserName =
        this.reactionUserNames[otherReactors[0]] || 'Jemand';
      return `${otherUserName} und Du haben reagiert.`;
    }

    const firstReactorName = this.reactionUserNames[reactors[0]] || 'Jemand';
    return `${firstReactorName} hat reagiert.`;
  }

  toggleEditDialog(messageId: string) {
    this.showEditDialog = this.showEditDialog === messageId ? null : messageId;
  }

  cancelEdit() {
    this.showEditArea = null;
    this.messageToEdit = '';
  }

  async saveEditedMessage(messageId: string) {
    try {
      const messageDocRef =
        messageId === this.topicMessage?.id
          ? doc(
              this.db,
              'channels',
              this.selectedChannel.id,
              'messages',
              messageId
            )
          : doc(
              this.db,
              'channels',
              this.selectedChannel.id,
              'messages',
              this.channelMessageId,
              'thread',
              messageId
            );

      await updateDoc(messageDocRef, { 
        text: this.messageToEdit,
        isEdited: true,
       });

      this.showEditArea = null;
      this.messageToEdit = '';

      console.log(`Message ${messageId} updated successfully.`);
    } catch (error) {
      console.error('Error saving edited message:', error);
    }
  }

  toggleEditArea(messageId: string, messageText: string) {
    if (this.showEditArea === messageId) {
      this.showEditArea = null;
      this.messageToEdit = '';
    } else {
      this.showEditArea = messageId;
      this.messageToEdit = messageText;
      this.toggleEditDialog(messageId);
    }
  }


  deleteFile(index: number) {
    this.global.selectChannelThreadFiles.splice(index, 1);
  } 


}
