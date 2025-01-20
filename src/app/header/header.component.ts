import {
  Component,
  OnDestroy,
  OnInit,
  inject,
  Output,
  EventEmitter,
  ElementRef,
  HostListener,
} from '@angular/core';
import { RouterModule } from '@angular/router';
import { AuthService } from '../services/auth.service';
import {
  collection,
  Firestore,
  onSnapshot,
  getDocs,
  updateDoc,
  doc,
  arrayRemove,
  arrayUnion,
  deleteDoc,
  setDoc,
} from '@angular/fire/firestore';
import { User } from '../models/user.class';
import { ActivatedRoute } from '@angular/router';
import { UserService } from '../services/user.service';
import { DialogHeaderDropdownComponent } from '../dialog-header-dropdown/dialog-header-dropdown.component';
import { MatMenuModule } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';
import { CommonModule } from '@angular/common';
import { switchMap } from 'rxjs';
import { OverlayStatusService } from '../services/overlay-status.service';
import { Subscription } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { GlobalVariableService } from '../services/global-variable.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [
    RouterModule,
    DialogHeaderDropdownComponent,
    MatMenuModule,
    MatButtonModule,
    CommonModule,
    FormsModule,
    MatCardModule,
  ],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
})
export class HeaderComponent implements OnInit, OnDestroy {
  auth = inject(AuthService);
  firestore = inject(Firestore);
  user: User = new User();
  userID: any;
  userservice = inject(UserService);
  clicked = false;
  allUsers: User[] = [];
  unsub?: () => void;
  overlayStatusService = inject(OverlayStatusService);
  overlayOpen = false;
  private overlayStatusSub!: Subscription;
  searcheNameOrChannel:string='';
  global=inject(GlobalVariableService);
  overlay = inject(OverlayStatusService);
  @Output() headerUserSelected = new EventEmitter<any>();
  getChannels:any[]=[];
  filterChannel:any[]=[];
  noChannelFounded:boolean=false;
  listlastResultResult:boolean=false;
  showUserList:boolean=false;
  showChannelList:boolean=false;
  channelIdHover:string='';
  hoverResultnameId:string='';
  getSeperateUser:any={};
  @Output() headerChannelSelcted = new EventEmitter<any>();
  getAllUsersCollection:any[]=[];
  filteredUsers: any[] = [];
  noUserFounded:boolean=false;
  userIdHover:string='';


  constructor(private route: ActivatedRoute,private eRef: ElementRef ) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe(async (paramMap) => {
      this.userID = paramMap.get('id');
      if (this.userID) {
        this.getUser(this.userID);
        const userResult = await this.userservice.getUser(this.userID);
        if (userResult) {
          this.user = userResult;
          this.userservice.observingUserChanges(
            this.userID,
            (updatedUser: User) => {
              this.user = updatedUser;
            }
          );
        }
      }
    });
    this.subscribeOverlayService();
    this.getAllUsers();
    this.getAllChannels();
  }

  subscribeOverlayService() {
    this.overlayStatusSub = this.overlayStatusService.overlayStatus$.subscribe(
      (status) => {
        this.overlayOpen = status;
      }
    );
  }

  closePicker() {
    this.overlay.setOverlayStatus(false);
  }

  ngOnDestroy(): void {
    if (this.unsub) {
      this.unsub();
    }
    if (this.overlayStatusSub) {
      this.overlayStatusSub.unsubscribe();
    }
  }

  toggleDropDown() {
    this.clicked = !this.clicked;
    this.overlayStatusService.setOverlayStatus(this.clicked);
  }

  closeDropDown() {
    this.overlayStatusService.setOverlayStatus(false);
  }

  @HostListener('document:click', ['$event'])
  closeDropdowns(event: Event): void {
    const clickedElement = event.target as HTMLElement;
    if (
      !clickedElement.closest('.mainSearch-box') &&
      !clickedElement.closest('input')
    ) {
      this.showUserList = false;
      this.showChannelList = false;
      this.listlastResultResult = false;
      this.searcheNameOrChannel = '';
    }
  }
  
  handleFocus(): void { 
      this.listlastResultResult=true
  }
   
   checkInputValue(){
    if(this.searcheNameOrChannel.startsWith('@') && this.searcheNameOrChannel.trim() !== ''){
      this.showUserList=true;
      this.filterUsers();
    } else if (
      this.searcheNameOrChannel.startsWith('#') &&
      this.searcheNameOrChannel.trim() !== ''
    ) {
      this.showChannelList = true;
      this.filterChannels();
    } else {
      this.showUserList = false;
      this.showChannelList = false;
    }
  }


  checkUserId(user: any) {
    this.userIdHover = user.id;
  }

  leaveUserId() {
    this.userIdHover = '';
  }

  getAllUsers(){
    const userRef=collection(this.firestore,'users')
    onSnapshot(userRef,(querySnapshot)=>{
    this.getAllUsersCollection=[];
    querySnapshot.forEach((doc)=>{
      if(this.userID !== doc.id) {
        const allUsers=doc.data();
        this.getAllUsersCollection.push({id:doc.id,...allUsers})
      }
    })
    this.filterUsers();
    })
  } 

  filterUsers() {
    const searchValue = this.searcheNameOrChannel
      .toLowerCase()
      .replace('@', '')
      .trim();
    this.filteredUsers = this.getAllUsersCollection.filter(
      (user) => user.name.toLowerCase().includes(searchValue),
      (this.noUserFounded = false)
    );
    if (this.filteredUsers.length === 0) {
      this.noUserFounded = true;
    }
  }
     
  checkWidtSize(){
    if(window.innerWidth<=1200){
      return  this.global.openChannelorUserBox = true;
    }else{
      return  this.global.openChannelorUserBox = false;
     }
   } 

   checkThredBox() {
    if(window.innerWidth<=1200 && this.global.openChannelOrUserThread){
      this.global.openChannelOrUserThread=false;
      this.global.openChannelorUserBox=true;
    }
   }

   hiddenThreadFullBox(){
    if(window.innerWidth<=1349 && window.innerWidth > 1200 && this.global.checkWideChannelOrUserThreadBox){
      this.global.checkWideChannelorUserBox=true;
      this.global.checkWideChannelOrUserThreadBox=false;
    }
  }


  async enterChatUser(user: any) {  
     const channelRef = doc(this.firestore, 'searchHeaderResult', this.userID);
     await setDoc(channelRef, {searchHeaderResult: arrayUnion(user) }, { merge: true });
     this.headerUserSelected.emit(user);  
        this.showUserList = false;
        this.searcheNameOrChannel = '';
        this.listlastResultResult = false;
        this.hoverResultnameId = '';
        this.hiddenThreadFullBox();
        this.checkThredBox();
        this.checkWidtSize();
} 
  

  async getAllChannels () {
      const channelRef = collection(this.firestore, 'channels');
      onSnapshot(channelRef, (querySnapshot) => {
        this.getChannels = []; 
        querySnapshot.forEach(async (doc) => {
          const channelData = doc.data();
          const channelId = doc.id;
          const channel:any = { id: channelId, ...channelData, messages: [] };
          const messagesRef = collection(this.firestore, 'channels', channelId, 'messages');
          const messagesSnapshot = await getDocs(messagesRef);
          messagesSnapshot.forEach((messageDoc) => {
            channel.messages.push({ id: messageDoc.id, ...messageDoc.data() });
          });
          this.getChannels.push(channel);
        });
      });
    }
  
    filterChannels(){
       const  searchChannel=this.searcheNameOrChannel.toLowerCase().replace('#','').trim()
       this.filterChannel=this.getChannels.filter((channel)=>
        channel.name.toLowerCase().includes(searchChannel),
        this.noChannelFounded=false
       );
        if(this.filterChannel.length===0){
          this.noChannelFounded=true;
        }
    }

  checkChannelId(channel: any) {
    this.channelIdHover = channel.id;
  }

    leaveChannelId(){
      this.channelIdHover='';
    } 
  
  async  enterChannel(channel:any){
      const channelRef = doc(this.firestore, 'searchHeaderResult', this.userID);
      await setDoc(channelRef, {searchHeaderResult: arrayUnion(channel)}, { merge: true });
      this.headerChannelSelcted.emit(channel);
      this.showChannelList=false;
      this.searcheNameOrChannel='';
      this.listlastResultResult=false;
      this.hiddenThreadFullBox();
      this.checkThredBox();
      this.checkWidtSize();
    }
    
    getUser(currentId:any){
      const docRef=doc(this.firestore,'searchHeaderResult',currentId);
      if (!this.userID) {
        return;
    } 
      onSnapshot(docRef,(docSnapshot)=>{
         if(docSnapshot.exists()){
            const data=docSnapshot.data();
            const id = docSnapshot.id;
            this.getSeperateUser={id:id,...data};
         }else{
          this.getSeperateUser={};
         }
      })
    }
    
    checkuserResultId(user:any){
      this.hoverResultnameId=user.id
    } 

    leaveCheckuserResultId(){
      this.hoverResultnameId='';
    }
      
     hoverResultChannelId:string=''
      checkChannelResultId(channel:any){
       this.hoverResultChannelId=channel.id 
    } 

    leaveCheckChannelResultId(){
      this.hoverResultChannelId=''
    }

     deleteUser(user:any){
        const docRef=doc(this.firestore,'searchHeaderResult',this.userID)
        updateDoc(docRef,{searchHeaderResult:arrayRemove(user)})
     }
}
