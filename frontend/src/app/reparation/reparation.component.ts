import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
    selector: 'app-reparation',
    standalone: true,
    imports: [],
    templateUrl: './reparation.component.html',
    styleUrl: './reparation.component.css'
})
export class ReparationComponent {
    constructor(private router: Router) { }
    goHome() { this.router.navigate(['']); }
}
