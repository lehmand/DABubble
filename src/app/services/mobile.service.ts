import { Injectable, OnInit } from '@angular/core';
import { BehaviorSubject, fromEvent, map, startWith } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class MobileService {

  isMobile$ = new BehaviorSubject<boolean>(false);

  constructor() {
    fromEvent(window, 'resize').pipe(
      startWith(null),
      map(() => window.innerWidth <= 575)
    ).subscribe(this.isMobile$);
   }
}
