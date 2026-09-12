import { ApiProperty } from '@nestjs/swagger';
import {
    IsEmail,
    IsString,
    MaxLength,
    MinLength,
} from 'class-validator';

export class LoginDto {
    @ApiProperty({
        example: 'admin@gmail.com',
        description: 'User email address',
    })
    @IsEmail()
    email: string;

    @ApiProperty({
        example: 'password',
        description: 'User password',
        minLength: 1,
        maxLength: 128,
    })
    @IsString()
    @MinLength(1)
    @MaxLength(128)
    password: string;
}

