import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  EventEmitter,
  inject,
  Input,
  OnInit,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import {
  collection,
  doc,
  DocumentReference,
  Firestore,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  QuerySnapshot,
  Unsubscribe,
  updateDoc,
} from '@angular/fire/firestore';
import { GlobalVariableService } from '../services/global-variable.service';
import { PickerComponent } from '@ctrl/ngx-emoji-mart';
import { getAuth } from '@angular/fire/auth';
import { FormsModule } from '@angular/forms';
import { animate, style, transition, trigger } from '@angular/animations';
import { OverlayStatusService } from '../services/overlay-status.service';
import { MentionMessageBoxComponent } from '../mention-message-box/mention-message-box.component';
import { GlobalService } from '../global.service';

interface Message {
  id: string;
  senderId: string;
  text: string;
  timestamp: Date;
  senderName: string;
  senderPicture: string;
  reactions: { [emoji: string]: string[] };
  selectedFiles?: any[];
  replyCount: number;
  isEdited: boolean;
}

@Component({
  selector: 'app-channel-chat',
  standalone: true,
  imports: [
    CommonModule,
    PickerComponent,
    FormsModule,
    MentionMessageBoxComponent,
  ],
  templateUrl: './channel-chat.component.html',
  styleUrl: './channel-chat.component.scss',
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
export class ChannelChatComponent implements OnInit {
  @Input() selectedChannel: any;
  firestore = inject(Firestore);
  global = inject(GlobalVariableService);
  overlay = inject(OverlayStatusService);
  messagesData: Message[] = [];
  threadMessages: Message[] = [];
  showThreadInfo: boolean = false;
  showEditDialog: string | null = null;
  showEditArea: string | null = null;
  hoveredMessageId: string | null = null;
  hoveredReactionMessageId: string | null = null;
  reactionUserNames: { [userId: string]: string } = {};
  hoveredEmoji: string | null = null;
  isPickerVisible: string | null = null;
  editingMessageId: string | null = null;
  currentUserLastEmojis: string[] = [];
  messageToEdit: string = '';
  getAllUsersName: any[] = [];
  unsubscribe: (() => void) | undefined;
  wasClickedInChannelInput: boolean = false;
  @Output() enterChatFromChannel = new EventEmitter<any>();
  globalService = inject(GlobalVariableService);
  @Output() headerUpdate: EventEmitter<any> = new EventEmitter<any>();
  shouldScrollDown = true;
  @ViewChild('scrollContainer') private scrollContainer!: ElementRef;

  constructor() {}

  async ngOnInit(): Promise<void> {
    await this.loadChannelMessages();
    await this.loadCurrentUserEmojis();
    await this.getAllUsersname();
    await this.loadUserNames();
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
    setTimeout(() => {
      this.shouldScrollDown = false;
    }, 500)
  }

  onCancelMessageBox(): void {
    this.wasClickedInChannelInput = false;
  }

  enterChatByUserName(user: any) {
    this.enterChatFromChannel.emit(user);
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

  async handleMentionClick(mention: string) {
    this.wasClickedInChannelInput = true;
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
    this.wasClickedInChannelInput = false;
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

  async loadUserNames() {
    const auth = getAuth();
    const userDocs = await Promise.all(
      this.messagesData
        .flatMap((message) =>
          Object.values(message.reactions || {})
            .flat()
            .filter((userId) => userId !== auth.currentUser?.uid)
        )
        .filter((userId, index, self) => self.indexOf(userId) === index)
        .map((userId) => getDoc(doc(this.firestore, 'users', userId)))
    );

    userDocs.forEach((doc) => {
      const userData = doc.data();
      if (userData?.['name']) {
        this.reactionUserNames[doc.id] = userData['name'];
      }
    });
  }

  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    if (changes['selectedChannel'] && this.selectedChannel) {
      await this.loadChannelMessages();
    }
  }

  async loadChannelMessages() {
    if (!this.selectedChannel) {
      console.warn('No channel selected');
      return;
    }
  
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  
    const messagesRef = collection(
      this.firestore,
      'channels',
      this.selectedChannel.id,
      'messages'
    );
  
    const q = query(messagesRef, orderBy('timestamp', 'asc'));
  
    // Store unsubscribes for subcollection listeners
    const threadUnsubscribes: { [messageId: string]: Unsubscribe } = {};
  
    this.unsubscribe = onSnapshot(q, async (querySnapshot: any) => {
      const messages = await Promise.all(
        querySnapshot.docs.map(async (doc: any) => {
          const data = doc.data();
          if (data.timestamp && data.timestamp.seconds) {
            data.timestamp = new Date(data.timestamp.seconds * 1000);
          }
  
          const messageId = doc.id;
  
          // Set up a listener for the thread subcollection
          const threadRef = collection(
            this.firestore,
            'channels',
            this.selectedChannel.id,
            'messages',
            messageId,
            'thread'
          );
  
          if (threadUnsubscribes[messageId]) {
            // Remove existing listener to prevent duplicates
            threadUnsubscribes[messageId]();
          }
  
          const threadUnsubscribe = onSnapshot(threadRef, (threadSnapshot: QuerySnapshot) => {
            const messageIndex = this.messagesData.findIndex((m) => m.id === messageId);
            if (messageIndex !== -1) {
              this.messagesData[messageIndex].replyCount = threadSnapshot.size;
            }
          });
  
          // Store the unsubscribe function
          threadUnsubscribes[messageId] = threadUnsubscribe;
  
          return { id: messageId, ...data, replyCount: 0 }; // Default reply count will be updated by the listener
        })
      );
  
      this.messagesData = messages;
      setTimeout(() => {
        this.scrollToBottom();
      }, 250);
    });
  }

  ngOnDestroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }

  togglePicker(messageId: string, isEditing: boolean = false) {
    this.isPickerVisible =
    this.isPickerVisible === messageId ? null : messageId;
    this.editingMessageId = isEditing ? messageId : null; // Track editing mode
    this.overlay.setOverlayStatus(true);
  }

  async addLastUsedEmoji(emoji: any) {
    const auth = getAuth();
    const currentUserId = auth.currentUser?.uid;
    
    if (!currentUserId) {
      console.warn('No current user logged in');
      return;
    }

    // Handle both string emojis and emoji-mart events
    const emojiNative = typeof emoji === 'string' ? emoji : emoji?.native;
    
    if (!emojiNative) {
      console.error('Invalid emoji provided:', emoji);
      return;
    }

    const docRef = doc(this.firestore, 'users', currentUserId);
    
    try {
      const userDoc = await getDoc(docRef);
      const userData = userDoc.data();
      const existingEmojis = userData?.['lastEmojis'] || [];
      
      // Remove the emoji if it already exists to avoid duplicates
      const filteredEmojis = existingEmojis.filter((e: any) => e !== emojiNative);
      
      // Add new emoji at the start and keep only the last 2
      const updatedEmojis = [emojiNative, ...filteredEmojis].slice(0, 2);

      // Update Firestore
      await updateDoc(docRef, { lastEmojis: updatedEmojis });
      
      // Update local state immediately
      this.currentUserLastEmojis = updatedEmojis;
      
    } catch (error) {
      console.error('Error updating last emojis:', error);
    }
  }

  async getExistingEmojis(userDocRef: DocumentReference): Promise<string[]> {
    const userDoc = await getDoc(userDocRef);
    const userData = userDoc.data();
    return userData?.['lastEmojis'] || [];
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

  addEmojiToMessage(emoji: string, messageId: string) {
    if (this.editingMessageId === messageId) {
      // Append emoji to the message being edited
      this.messageToEdit += emoji;
    } else {
      // Existing reaction logic
      const auth = getAuth();
      const currentUserId = auth.currentUser?.uid;

      if (!currentUserId) {
        console.warn('No current user logged in');
        return;
      }

      this.shouldScrollDown = false;
      this.addLastUsedEmoji(emoji);

      const messageDocRef = doc(
        this.firestore,
        'channels',
        this.selectedChannel.id,
        'messages',
        messageId
      );

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

        updateDoc(messageDocRef, { reactions }).catch((error) => {
          console.error('Error updating reactions:', error);
        });
      });
    }

    this.closePicker();
    this.shouldScrollDown = false;
  }

  closePicker() {
    this.isPickerVisible = null;
    this.editingMessageId = null;
    this.overlay.setOverlayStatus(false);
  }

  hasReactions(reactions: { [emoji: string]: string[] }): boolean {
    return reactions && Object.keys(reactions).length > 0;
  }

  openThread(messageId: string) {
    this.global.setChannelThread(messageId);
    this.openvollThreadBox();
    this.hiddenFullChannelOrUserThreadBox();
    this.checkWidthSize();
    this.checkThreadOpen();
  }

  checkThreadOpen(){
    if(window.innerWidth<=1200 && this.global.openChannelorUserBox ){
      this.global.openChannelorUserBox=false
    }
  }

checkWidthSize(){
  if(window.innerWidth<=1200){
     return this.global.openChannelOrUserThread=true 
  }else{
    return this.global.openChannelOrUserThread=false;    
  }
}

openvollThreadBox() {
  if(window.innerWidth<=1900 && window.innerWidth > 1200){
    return this.global.checkWideChannelOrUserThreadBox=true;
  }else{
    return this.global.checkWideChannelOrUserThreadBox=false;
  }
} 
  
hiddenFullChannelOrUserThreadBox(){
  if(window.innerWidth<=1900 && window.innerWidth > 1200 && this.global.checkWideChannelorUserBox){
    this.global.checkWideChannelorUserBox=false;
  }
}

  displayDayInfo(index: number): boolean {
    if (index === 0) return true;
    const currentMessage = this.messagesData[index];
    const previousMessage = this.messagesData[index - 1];
    return !this.isSameDay(
      new Date(currentMessage.timestamp),
      new Date(previousMessage.timestamp)
    );
  }

  isSameDay(date1: Date, date2: Date): boolean {
    return (
      date1.getDate() === date2.getDate() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getFullYear() === date2.getFullYear()
    );
  }

  getDayInfoForMessage(index: number): string {
    const messageDate = new Date(this.messagesData[index].timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    if (this.isSameDay(messageDate, today)) {
      return 'Heute';
    } else if (this.isSameDay(messageDate, yesterday)) {
      return 'Gestern';
    } else {
      return this.formatDate(messageDate);
    }
  }

  formatDate(date: Date): string {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
  }

  toggleEditDialog(messageId: string) {
    this.showEditDialog = this.showEditDialog === messageId ? null : messageId;
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

  async saveEditedMessage(messageId: string) {
    try {
      const messageDocRef = doc(
        this.firestore,
        'channels',
        this.selectedChannel.id,
        'messages',
        messageId
      );

      await updateDoc(messageDocRef, {
         text: this.messageToEdit,
         isEdited: true,
         });

         const messageIndex = this.messagesData.findIndex((msg) => msg.id === messageId);
    if (messageIndex !== -1) {
      this.messagesData[messageIndex].text = this.messageToEdit;
      this.messagesData[messageIndex].isEdited = true;
    }

      this.showEditArea = null;
      this.messageToEdit = '';

      console.log(`Message ${messageId} updated successfully.`);
    } catch (error) {
      console.error('Error saving edited message:', error);
    }
  }

  cancelEdit() {
    this.showEditArea = null;
    this.messageToEdit = '';
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
          const userDoc = await getDoc(doc(this.firestore, 'users', userId));
          const userData = userDoc.data();
          if (userData?.['name']) {
            this.reactionUserNames[userId] = userData['name'];
          }
        })
      );
    }
  }
}
