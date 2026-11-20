import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { AuthService } from "./auth.service";
import { ExtractJwt, Strategy } from "passport-jwt";
import { UsersService } from "src/users/users.service";
import { Request } from 'express';
import * as dotenv from 'dotenv';
dotenv.config();

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy){
    constructor(private userService: UsersService, private authService: AuthService){
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration:false,
            secretOrKey:process.env.JWT_SECRET,
            passReqToCallback: true,
        })
    }

     async validate(req: Request, payload: any) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const user = await this.userService.findByEmail(payload.email);

    if (!user || (token && (await this.authService.isTokenBlacklisted(token)))) {
      throw new UnauthorizedException(
        'Token no válido o usuario no encontrado',
      );
    }
    return { email: user.correo_sena, role: user.rol_asignado };
  }
}
